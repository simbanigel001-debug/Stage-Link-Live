'use strict';

const StudioLiveDriver = require('./studiolive-driver');
const X32Driver = require('./x32-driver');
const YamahaDriver = require('./yamaha-driver');

class MixerManager {
  /**
   * Create a MixerManager supporting X32/M32, StudioLive, and Yamaha consoles.
   * @param {Object} config - Configuration object
   * @param {string} config.type - Mixer type: 'x32', 'studiolive', or 'yamaha'
   * @param {string} config.ip - Mixer IP address
   * @param {number} [config.port] - Mixer port (optional, falls back to default per driver)
   */
  constructor(config) {
    if (!config) {
      throw new Error('MixerManager requires a config object.');
    }
    if (!config.type || !config.ip) {
      throw new Error('MixerManager config requires type and ip.');
    }

    this.validTypes = ['studiolive', 'presonus', 'x32', 'm32', 'yamaha', 'cl', 'ql', 'tf'];
    const normalizedType = config.type.toLowerCase();
    
    if (!this.validTypes.includes(normalizedType)) {
      throw new Error(`Invalid mixer type: ${config.type}. Must be one of: ${this.validTypes.join(', ')}`);
    }

    this.config = config;
    this.mixerType = normalizedType;
    this.mixer = null;
    this.connected = false;

    this._initializeMixer();
  }

  /**
   * Initialize the driver corresponding to this.mixerType
   * @private
   */
  _initializeMixer() {
    const port = this.config.port;

    switch (this.mixerType) {
      case 'studiolive':
      case 'presonus':
        this.mixer = new StudioLiveDriver(this.config.ip, port || 53000);
        console.log(`[MixerManager] Initialized StudioLiveDriver (${this.config.ip}:${port || 53000})`);
        break;

      case 'x32':
      case 'm32':
        this.mixer = new X32Driver(this.config.ip, port || 10023);
        console.log(`[MixerManager] Initialized X32Driver (${this.config.ip}:${port || 10023})`);
        break;

      case 'yamaha':
      case 'cl':
      case 'ql':
      case 'tf':
        this.mixer = new YamahaDriver({ ip: this.config.ip, port: port || 49280 });
        console.log(`[MixerManager] Initialized YamahaDriver (${this.config.ip}:${port || 49280})`);
        break;

      default:
        throw new Error(`Unsupported mixer driver type: ${this.mixerType}`);
    }
  }

  /**
   * Connect to the active hardware mixer instance.
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.connected) {
      console.log(`[MixerManager] Already connected to ${this.mixerType} mixer.`);
      return;
    }

    try {
      if (typeof this.mixer.connect === 'function') {
        await this.mixer.connect();
      }
      this.connected = true;
      console.log(`[MixerManager] Successfully connected to ${this.mixerType} mixer at ${this.config.ip}.`);
    } catch (err) {
      console.error(`[MixerManager] Failed to connect to ${this.mixerType} mixer:`, err);
      throw err;
    }
  }

  /**
   * Dynamically switch mixer protocols at runtime.
   * @param {string} newType - 'x32', 'studiolive', 'yamaha', etc.
   * @param {string} [newIp] - Optional new IP address
   * @param {number} [newPort] - Optional new Port
   */
  async switchDriver(newType, newIp, newPort) {
    const normalizedType = newType.toLowerCase();
    if (!this.validTypes.includes(normalizedType)) {
      throw new Error(`Cannot switch driver. Invalid mixer type: ${newType}`);
    }

    console.log(`[MixerManager] Switching protocol from ${this.mixerType} to ${normalizedType}...`);
    
    this.disconnect();
    this.config.type = normalizedType;
    if (newIp) this.config.ip = newIp;
    if (newPort) this.config.port = newPort;

    this.mixerType = normalizedType;
    this._initializeMixer();
    await this.connect();
  }

  /**
   * Update channel volume level across all driver interfaces.
   * @param {number} channel - Input Channel
   * @param {number} level - Volume level (Supports 0-100% or 0.0-1.0 float)
   * @returns {Promise<void>}
   */
  async updateChannel(channel, level) {
    if (!this.connected || !this.mixer) {
      return Promise.reject(new Error('Mixer not connected. Call connect() first.'));
    }

    if (!Number.isFinite(channel) || channel < 0) {
      return Promise.reject(new Error('Channel must be a non-negative number.'));
    }

    if (!Number.isFinite(level) || level < 0) {
      return Promise.reject(new Error('Level must be a non-negative number.'));
    }

    const normalizedFloat = level > 1 ? level / 100 : level;
    const percentage = level <= 1 ? Math.round(level * 100) : level;

    try {
      if (typeof this.mixer.setChannelVolume === 'function') {
        // Accepts percentage (0-100)
        await this.mixer.setChannelVolume(channel, percentage);
      } else if (typeof this.mixer.setChannelLevel === 'function') {
        // Accepts float (0.0-1.0)
        await this.mixer.setChannelLevel(channel, normalizedFloat);
      }
      console.log(`[MixerManager] Updated channel ${channel} level on ${this.mixerType}.`);
    } catch (err) {
      console.error(`[MixerManager] Error updating channel ${channel}:`, err);
      throw err;
    }
  }

  /**
   * Update spatial IEM bus send pan for a performer.
   * @param {number} channel - Input Channel
   * @param {number} bus - Target Aux/Bus pair
   * @param {number} pan - Stereo Pan (-1.0 Left to +1.0 Right)
   */
  async updateSpatialPan(channel, bus, pan) {
    if (!this.connected || !this.mixer) return;

    try {
      if (typeof this.mixer.setBusSendPan === 'function') {
        await this.mixer.setBusSendPan(channel, bus, pan);
        console.log(`[MixerManager] Updated spatial pan for channel ${channel} -> Bus ${bus} (${pan}) on ${this.mixerType}.`);
      } else {
        console.warn(`[MixerManager] Driver '${this.mixerType}' does not implement setBusSendPan.`);
      }
    } catch (err) {
      console.error(`[MixerManager] Error setting spatial pan on ${this.mixerType}:`, err);
    }
  }

  /**
   * Update multiple channels in parallel.
   * @param {Array<{channel: number, level: number}>} updates
   * @returns {Promise<void>}
   */
  async updateChannels(updates) {
    if (!Array.isArray(updates)) {
      return Promise.reject(new Error('Updates must be an array.'));
    }

    try {
      const promises = updates.map(update =>
        this.updateChannel(update.channel, update.level)
      );
      await Promise.all(promises);
      console.log(`[MixerManager] Updated ${updates.length} channels on ${this.mixerType}.`);
    } catch (err) {
      console.error('[MixerManager] Error updating multiple channels:', err);
      throw err;
    }
  }

  /**
   * Disconnect the underlying mixer device.
   */
  disconnect() {
    if (!this.mixer) {
      console.log('[MixerManager] No mixer to disconnect.');
      this.connected = false;
      return;
    }

    try {
      if (typeof this.mixer.disconnect === 'function') {
        this.mixer.disconnect();
      }
      this.connected = false;
      console.log(`[MixerManager] Disconnected from ${this.mixerType} mixer.`);
    } catch (err) {
      console.error('[MixerManager] Error disconnecting:', err);
    }
  }

  getMixerType() {
    return this.mixerType;
  }

  isConnected() {
    return this.connected;
  }

  getMixerInstance() {
    return this.mixer;
  }
}

module.exports = MixerManager;

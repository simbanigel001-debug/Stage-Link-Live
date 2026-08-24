'use strict';

const StudioLiveDriver = require('./studiolive-driver');
const X32Driver = require('./x32-driver');
const YamahaDriver = require('./yamaha-driver');

class MixerManager {
  /**
   * Create a MixerManager that can initialize and manage different mixer types.
   * @param {Object} config - Configuration object
   * @param {string} config.type - Mixer type: 'studiolive', 'x32', or 'yamaha'
   * @param {string} config.ip - Mixer IP address
   * @param {number} [config.port] - Mixer port
   */
  constructor(config) {
    if (!config) {
      throw new Error('MixerManager requires a config object.');
    }
    if (!config.type || !config.ip) {
      throw new Error('MixerManager config requires type and ip.');
    }

    const validTypes = ['studiolive', 'x32', 'yamaha', 'cl', 'ql', 'tf'];
    if (!validTypes.includes(config.type.toLowerCase())) {
      throw new Error(`Invalid mixer type: ${config.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    this.config = config;
    this.mixerType = config.type.toLowerCase();
    this.mixer = null;
    this.connected = false;

    this._initializeMixer();
  }

  /**
   * Initialize the appropriate mixer driver based on config type.
   * @private
   */
  _initializeMixer() {
    const port = this.config.port;

    switch (this.mixerType) {
      case 'studiolive':
      case 'presonus':
        this.mixer = new StudioLiveDriver(this.config.ip, port || 53000);
        console.log(`[MixerManager] Initialized StudioLiveDriver for ${this.config.ip}:${port || 53000}`);
        break;
      case 'x32':
      case 'm32':
        this.mixer = new X32Driver(this.config.ip, port || 10023);
        console.log(`[MixerManager] Initialized X32Driver for ${this.config.ip}:${port || 10023}`);
        break;
      case 'yamaha':
      case 'cl':
      case 'ql':
      case 'tf':
        this.mixer = new YamahaDriver({ ip: this.config.ip, port: port || 49280 });
        console.log(`[MixerManager] Initialized YamahaDriver for ${this.config.ip}:${port || 49280}`);
        break;
      default:
        throw new Error(`Unsupported mixer type: ${this.mixerType}`);
    }
  }

  /**
   * Connect to the mixer device.
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.connected) {
      console.log(`[MixerManager] Already connected to ${this.mixerType} mixer.`);
      return;
    }

    try {
      await this.mixer.connect();
      this.connected = true;
      console.log(`[MixerManager] Successfully connected to ${this.mixerType} mixer.`);
    } catch (err) {
      console.error(`[MixerManager] Failed to connect to ${this.mixerType} mixer:`, err);
      throw err;
    }
  }

  /**
   * Switch protocol/driver on the fly.
   * @param {string} type - Mixer type name ('x32', 'studiolive', 'yamaha')
   */
  async switchDriver(type) {
    console.log(`[MixerManager] Switching protocol from ${this.mixerType} to ${type}...`);
    this.disconnect();
    this.config.type = type;
    this.mixerType = type.toLowerCase();
    this._initializeMixer();
    await this.connect();
  }

  /**
   * Update the volume level for a specific channel on the mixer.
   * @param {number} channel - Channel index
   * @param {number} level - Volume level (0-100% or float 0.0-1.0)
   * @returns {Promise<void>}
   */
  async updateChannel(channel, level) {
    if (!this.connected || !this.mixer) {
      return Promise.reject(new Error('Mixer not connected. Call connect() first.'));
    }

    if (!Number.isFinite(channel) || channel < 0) {
      return Promise.reject(new Error('Channel must be a non-negative number.'));
    }

    // Normalize level if passed as percentage (0-100) or float (0-1)
    const normalizedLevel = level > 1 ? level / 100 : level;

    try {
      if (typeof this.mixer.setChannelVolume === 'function') {
        await this.mixer.setChannelVolume(channel, level);
      } else if (typeof this.mixer.setChannelLevel === 'function') {
        await this.mixer.setChannelLevel(channel, normalizedLevel);
      }
      console.log(`[MixerManager] Updated channel ${channel} level on ${this.mixerType} mixer.`);
    } catch (err) {
      console.error(`[MixerManager] Error updating channel ${channel}:`, err);
      throw err;
    }
  }

  /**
   * Update spatial IEM bus send pan for a performer.
   * @param {number} channel - Input Channel
   * @param {number} bus - Target Aux/Bus pair
   * @param {number} pan - Stereo Pan (-1.0 to +1.0)
   */
  async updateSpatialPan(channel, bus, pan) {
    if (!this.connected || !this.mixer) return;

    try {
      if (typeof this.mixer.setBusSendPan === 'function') {
        await this.mixer.setBusSendPan(channel, bus, pan);
      }
    } catch (err) {
      console.error(`[MixerManager] Error updating spatial pan for channel ${channel}:`, err);
    }
  }

  /**
   * Disconnect from the mixer device.
   * @returns {void}
   */
  disconnect() {
    if (!this.mixer) {
      console.log('[MixerManager] No mixer to disconnect.');
      this.connected = false;
      return;
    }

    try {
      this.mixer.disconnect();
      this.connected = false;
      console.log(`[MixerManager] Disconnected from ${this.mixerType} mixer.`);
    } catch (err) {
      console.error('[MixerManager] Error disconnecting:', err);
    }
  }

  /**
   * Get the current mixer type.
   * @returns {string} The mixer type
   */
  getMixerType() {
    return this.mixerType;
  }

  /**
   * Get the connection status.
   * @returns {boolean} True if connected, false otherwise
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get the underlying mixer instance.
   * @returns {Object} The active mixer driver instance
   */
  getMixerInstance() {
    return this.mixer;
  }

  /**
   * Update multiple channels at once.
   * @param {Array<{channel: number, level: number}>} updates - Array of channel updates
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
      console.log(`[MixerManager] Updated ${updates.length} channels.`);
    } catch (err) {
      console.error('[MixerManager] Error updating multiple channels:', err);
      throw err;
    }
  }
}

module.exports = MixerManager;

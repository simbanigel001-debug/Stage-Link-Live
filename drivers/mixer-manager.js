'use strict';

const StudioLiveDriver = require('./studiolive-driver');
const X32Driver = require('./x32-driver');

class MixerManager {
  /**
   * Create a MixerManager that can initialize and manage different mixer types.
   * @param {Object} config - Configuration object
   * @param {string} config.type - Mixer type: 'studiolive' or 'x32'
   * @param {string} config.ip - Mixer IP address
   * @param {number} config.port - Mixer UDP port
   */
  constructor(config) {
    if (!config) {
      throw new Error('MixerManager requires a config object.');
    }
    if (!config.type || !config.ip || !config.port) {
      throw new Error('MixerManager config requires type, ip, and port.');
    }

    const validTypes = ['studiolive', 'x32'];
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
    switch (this.mixerType) {
      case 'studiolive':
        this.mixer = new StudioLiveDriver(this.config.ip, this.config.port);
        console.log(`[MixerManager] Initialized StudioLiveDriver for ${this.config.ip}:${this.config.port}`);
        break;
      case 'x32':
        this.mixer = new X32Driver(this.config.ip, this.config.port);
        console.log(`[MixerManager] Initialized X32Driver for ${this.config.ip}:${this.config.port}`);
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
   * Update the volume level for a specific channel on the mixer.
   * @param {number} channel - Channel index
   * @param {number} level - Volume level (0-100%)
   * @returns {Promise<void>}
   */
  async updateChannel(channel, level) {
    if (!this.connected || !this.mixer) {
      return Promise.reject(new Error('Mixer not connected. Call connect() first.'));
    }

    if (!Number.isFinite(channel) || channel < 0) {
      return Promise.reject(new Error('Channel must be a non-negative number.'));
    }

    if (!Number.isFinite(level) || level < 0 || level > 100) {
      return Promise.reject(new Error('Level must be a number between 0 and 100.'));
    }

    try {
      await this.mixer.setChannelVolume(channel, level);
      console.log(`[MixerManager] Updated channel ${channel} to ${level}% on ${this.mixerType} mixer.`);
    } catch (err) {
      console.error(`[MixerManager] Error updating channel ${channel}:`, err);
      throw err;
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
   * @returns {string} The mixer type (e.g., 'studiolive', 'x32')
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
   * Get the underlying mixer instance (for advanced use cases).
   * @returns {StudioLiveDriver|X32Driver} The active mixer driver instance
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

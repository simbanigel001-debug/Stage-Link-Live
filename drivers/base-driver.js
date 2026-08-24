// drivers/base-driver.js
class BaseMixerDriver {
  constructor(config) {
    if (this.constructor === BaseMixerDriver) {
      throw new Error("BaseMixerDriver is an abstract class and cannot be instantiated directly.");
    }
    this.config = config;
    this.isConnected = false;
  }

  async connect() { throw new Error("Method 'connect()' must be implemented."); }
  async disconnect() { throw new Error("Method 'disconnect()' must be implemented."); }
  
  // Standardized Mixer Controls
  async setChannelMute(channel, isMuted) { throw new Error("Method 'setChannelMute()' must be implemented."); }
  async setChannelFader(channel, level) { throw new Error("Method 'setChannelFader()' must be implemented."); }
  async setChannelPan(channel, pan) { throw new Error("Method 'setChannelPan()' must be implemented."); }
  
  // Event Emitter Handlers
  onStateChange(callback) { throw new Error("Method 'onStateChange()' must be implemented."); }
}

module.exports = BaseMixerDriver;

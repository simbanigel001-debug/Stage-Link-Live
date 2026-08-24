// drivers/mock-driver.js
const BaseMixerDriver = require('./base-driver');

class MockDriver extends BaseMixerDriver {
  constructor(config = {}) {
    super(config);
    this.channels = Array.from({ length: 32 }, (_, i) => ({
      id: i + 1,
      mute: false,
      fader: 0.75,
      pan: 0.0
    }));
  }

  async connect() {
    this.isConnected = true;
    console.log('[MOCK DRIVER] Connected to Virtual Console.');
    return true;
  }

  async setChannelMute(channel, isMuted) {
    if (!this.channels[channel - 1]) return;
    this.channels[channel - 1].mute = isMuted;
    console.log(`[MOCK DRIVER] Channel ${channel} Mute set to: ${isMuted}`);
    return true;
  }

  async setChannelPan(channel, pan) {
    if (!this.channels[channel - 1]) return;
    this.channels[channel - 1].pan = pan;
    console.log(`[MOCK DRIVER] Channel ${channel} Pan set to: ${pan}`);
    return true;
  }
}

module.exports = MockDriver;

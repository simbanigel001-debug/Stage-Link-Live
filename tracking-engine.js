// tracking/tracking-engine.js
const EventEmitter = require('events');

class TrackingEngine extends EventEmitter {
  constructor() {
    super();
    this.providers = new Map();
    this.activeProvider = null;
  }

  registerProvider(name, providerInstance) {
    this.providers.set(name, providerInstance);
    
    // Relay unified position events to StageLink core
    providerInstance.on('POSITION_UPDATE', (updateData) => {
      this.emit('POSITION_UPDATE', this.normalizePayload(updateData));
    });
  }

  setProvider(name) {
    if (!this.providers.has(name)) {
      throw new Error(`Provider ${name} not registered.`);
    }
    if (this.activeProvider) {
      this.activeProvider.stop();
    }
    this.activeProvider = this.providers.get(name);
    this.activeProvider.start();
    console.log(`[STAGE INTELLIGENCE] Switched active tracking provider to: ${name}`);
  }

  normalizePayload(data) {
    return {
      musicianId: data.musicianId,
      coordinates: {
        x: data.x ?? 0,
        y: data.y ?? 0,
        z: data.z ?? 0
      },
      accuracyMeters: data.accuracy ?? 0.0,
      providerType: this.activeProvider?.name || 'MANUAL',
      timestamp: Date.now()
    };
  }
}

module.exports = TrackingEngine;

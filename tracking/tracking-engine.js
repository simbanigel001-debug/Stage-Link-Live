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

  // Maps stage horizontal coordinate (0 to 100) to stereo pan (-1.0 to +1.0)
  calculateSpatialPan(xCoord) {
    const normalized = (xCoord - 50) / 50;
    return Math.max(-1.0, Math.min(1.0, parseFloat(normalized.toFixed(2))));
  }

  normalizePayload(data) {
    const x = data.x ?? 0;
    const y = data.y ?? 0;
    const z = data.z ?? 0;

    return {
      musicianId: data.musicianId,
      coordinates: { x, y, z },
      calculatedPan: this.calculateSpatialPan(x),
      accuracyMeters: data.accuracy ?? 0.0,
      providerType: this.activeProvider?.name || 'MANUAL',
      timestamp: Date.now()
    };
  }
}

module.exports = TrackingEngine;

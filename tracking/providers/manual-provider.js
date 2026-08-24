// tracking/providers/manual-provider.js
const EventEmitter = require('events');

class ManualLocationProvider extends EventEmitter {
  constructor() {
    super();
    this.name = 'MANUAL';
  }

  start() {
    console.log('[TRACKING PROVIDER] Manual Engine active.');
  }

  stop() {
    console.log('[TRACKING PROVIDER] Manual Engine suspended.');
  }

  // Called when engineer drags avatar on screen
  updateManualPosition(musicianId, x, y, z = 0) {
    this.emit('POSITION_UPDATE', {
      musicianId,
      x,
      y,
      z,
      accuracy: 0.0 // Manual coordinates are treated as perfect exact placements
    });
  }
}

module.exports = ManualLocationProvider;

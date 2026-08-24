'use strict';

const dgram = require('dgram');
const EventEmitter = require('events');

class UWBProvider extends EventEmitter {
  /**
   * Hardware UWB Tracking Provider
   * Listens on a UDP port for tag position packets sent by hardware UWB anchors.
   * @param {Object} options Configuration options
   * @param {number} [options.port=8080] UDP port to listen for UWB anchor packets
   * @param {string} [options.host='0.0.0.0'] Host bind address
   * @param {number} [options.stageWidth=100] Physical stage width in meters/units
   * @param {number} [options.stageHeight=100] Physical stage depth in meters/units
   */
  constructor(options = {}) {
    super();
    this.port = options.port || 8080;
    this.host = options.host || '0.0.0.0';
    this.stageWidth = options.stageWidth || 100;
    this.stageHeight = options.stageHeight || 100;
    this.providerType = 'UWB';

    // Map tag MAC/ID to musician ID mapping: { 'tag_01': 1, 'tag_02': 2 }
    this.tagMap = new Map();
    this.socket = null;
    this.running = false;
  }

  /**
   * Bind a UWB Tag Hardware ID to a Musician ID in the system.
   * @param {string} tagId Hardware Tag identifier (e.g., 'TAG_01' or MAC address)
   * @param {number} musicianId Musician ID
   */
  mapTagToMusician(tagId, musicianId) {
    this.tagMap.set(tagId, musicianId);
    console.log(`[UWBProvider] Mapped Hardware Tag ${tagId} -> Musician ${musicianId}`);
  }

  /**
   * Start listening for incoming UDP telemetry packets from UWB hardware.
   */
  start() {
    if (this.running) return;

    this.socket = dgram.createSocket('udp4');

    this.socket.on('listening', () => {
      const address = this.socket.address();
      this.running = true;
      console.log(`[UWBProvider] Socket listening on ${address.address}:${address.port}`);
    });

    this.socket.on('message', (msg, rinfo) => {
      this._parseUWBMessage(msg);
    });

    this.socket.on('error', (err) => {
      console.error('[UWBProvider] Socket error:', err);
    });

    this.socket.bind(this.port, this.host);
  }

  /**
   * Parse incoming UWB hardware packets (Supports JSON format).
   * Format: { "tagId": "TAG_01", "x": 12.5, "y": 8.2, "accuracy": 0.15 }
   * @private
   */
  _parseUWBMessage(buffer) {
    try {
      const data = JSON.parse(buffer.toString('utf8'));
      const { tagId, x, y, accuracy } = data;

      if (!tagId || x === undefined || y === undefined) return;

      // Find mapped musician ID or default to integer parsing of tagId
      const musicianId = this.tagMap.get(tagId) || parseInt(tagId.replace(/\D/g, ''), 10);

      if (!musicianId || isNaN(musicianId)) return;

      // Normalize raw metric stage coordinates to percentage grid (0 - 100)
      const normalizedX = Math.max(0, Math.min(100, (x / this.stageWidth) * 100));
      const normalizedY = Math.max(0, Math.min(100, (y / this.stageHeight) * 100));

      // Emit event for TrackingEngine
      this.emit('POSITION_UPDATE', {
        musicianId,
        coordinates: {
          x: parseFloat(normalizedX.toFixed(2)),
          y: parseFloat(normalizedY.toFixed(2))
        },
        accuracyMeters: accuracy || 0.1,
        providerType: this.providerType,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('[UWBProvider] Failed to parse packet:', err.message);
    }
  }

  /**
   * Stop the UDP listener socket.
   */
  stop() {
    if (this.socket && this.running) {
      this.socket.close(() => {
        this.running = false;
        console.log('[UWBProvider] Stopped socket.');
      });
    }
  }
}

module.exports = UWBProvider;

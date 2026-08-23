'use strict';

const dgram = require('dgram');

class X32Driver {
  /**
   * Create a driver for a Behringer X32 or Midas M32 mixer over UDP OSC.
   * @param {string} ip - Mixer IP address
   * @param {number} port - Mixer UDP port (default 10023 for X32/M32)
   */
  constructor(ip, port) {
    if (!ip || !port) {
      throw new Error('X32Driver requires ip and port.');
    }
    this.ip = ip;
    this.port = port;
    this.socket = null;
    this.connected = false;
    this._onMessage = this._onMessage.bind(this);
    this._onError = this._onError.bind(this);
  }

  connect() {
    if (this.connected) {
      console.log(`[X32Driver] Already connected to ${this.ip}:${this.port}`);
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket('udp4');

      this.socket.on('error', this._onError);
      this.socket.on('message', this._onMessage);

      try {
        this.socket.connect(this.port, this.ip, (err) => {
          if (err) {
            console.error(`[X32Driver] Failed to connect UDP socket to ${this.ip}:${this.port}:`, err);
            this.socket.close();
            this.socket = null;
            return reject(err);
          }
          this.connected = true;
          console.log(`[X32Driver] UDP socket connected to ${this.ip}:${this.port}`);
          resolve();
        });
      } catch (ex) {
        console.error(`[X32Driver] Exception while connecting:`, ex);
        if (this.socket) {
          try { this.socket.close(); } catch (e) {}
          this.socket = null;
        }
        reject(ex);
      }
    });
  }

  setChannelVolume(channelIndex, levelPercent) {
    if (!this.connected || !this.socket) {
      return Promise.reject(new Error('Not connected. Call connect() before setChannelVolume.'));
    }
    if (!Number.isFinite(channelIndex) || channelIndex < 0) {
      return Promise.reject(new Error('channelIndex must be a non-negative number.'));
    }
    if (!Number.isFinite(levelPercent) || levelPercent < 0 || levelPercent > 100) {
      return Promise.reject(new Error('levelPercent must be a number between 0 and 100.'));
    }

    // Normalize percentage to OSC float value (0.0 to 1.0)
    const normalized = Math.max(0, Math.min(1, levelPercent / 100));
    const messageBuffer = this._buildOscFaderMessage(channelIndex, normalized);

    return new Promise((resolve, reject) => {
      this.socket.send(messageBuffer, (err) => {
        if (err) {
          console.error(`[X32Driver] Error sending fader for channel ${channelIndex}:`, err);
          return reject(err);
        }
        console.log(`[X32Driver] Sent volume ${levelPercent}% (=${normalized.toFixed(3)}) to channel ${channelIndex}`);
        resolve();
      });
    });
  }

  disconnect() {
    if (!this.socket) {
      console.log('[X32Driver] No socket to disconnect.');
      this.connected = false;
      return;
    }
    try {
      this.socket.off('message', this._onMessage);
      this.socket.off('error', this._onError);
    } catch (e) {
      // ignore if not supported
    }

    try {
      if (typeof this.socket.disconnect === 'function') {
        try { this.socket.disconnect(); } catch (e) {}
      }
      this.socket.close(() => {
        console.log(`[X32Driver] Socket closed (was connected to ${this.ip}:${this.port}).`);
      });
    } catch (ex) {
      console.error('[X32Driver] Error closing socket:', ex);
    } finally {
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * Build an OSC packet for X32 fader control.
   * OSC Address: /ch/{channel}/mix/fader
   * OSC Type: float (4 bytes, IEEE 754)
   * @param {number} channelIndex - Channel number (0-based or 1-based depending on mixer)
   * @param {number} normalizedValue - Float value between 0.0 and 1.0
   * @returns {Buffer} Complete OSC packet
   */
  _buildOscFaderMessage(channelIndex, normalizedValue) {
    // Construct OSC address pattern
    const address = `/ch/${channelIndex}/mix/fader`;

    // OSC message structure:
    // - Address (null-terminated string, padded to 4-byte boundary)
    // - Type tag string (null-terminated string, padded to 4-byte boundary)
    // - Arguments (in order specified by type tag)

    // Build address buffer
    const addressBuf = Buffer.from(address, 'utf8');
    const addressLen = addressBuf.length + 1; // +1 for null terminator
    const addressPadded = addressLen + (4 - (addressLen % 4)) % 4; // Pad to 4-byte boundary
    const addressBuffer = Buffer.alloc(addressPadded);
    addressBuf.copy(addressBuffer);

    // Build type tag buffer
    const typeTag = ',f'; // Type tag: comma followed by 'f' for float
    const typeTagBuf = Buffer.from(typeTag, 'utf8');
    const typeTagLen = typeTagBuf.length + 1; // +1 for null terminator
    const typeTagPadded = typeTagLen + (4 - (typeTagLen % 4)) % 4; // Pad to 4-byte boundary
    const typeTagBuffer = Buffer.alloc(typeTagPadded);
    typeTagBuf.copy(typeTagBuffer);

    // Build float argument buffer (IEEE 754 single precision, big-endian)
    const floatBuffer = Buffer.alloc(4);
    floatBuffer.writeFloatBE(normalizedValue, 0);

    // Concatenate all parts
    const packet = Buffer.concat([addressBuffer, typeTagBuffer, floatBuffer]);
    return packet;
  }

  _onMessage(msg, rinfo) {
    console.log(`[X32Driver] Received UDP message from ${rinfo.address}:${rinfo.port} - ${msg.length} bytes`);
    const preview = msg.length > 200 ? msg.slice(0, 200) : msg;
    try {
      console.log(preview.toString('utf8'));
    } catch (e) {
      console.log('<binary data>');
    }
  }

  _onError(err) {
    console.error('[X32Driver] Socket error:', err);
  }

  /**
   * Send a raw OSC packet.
   * @param {Buffer|string} payload - OSC packet data
   * @returns {Promise<void>}
   */
  sendRaw(payload) {
    if (!this.connected || !this.socket) {
      return Promise.reject(new Error('Not connected. Call connect() before sendRaw.'));
    }
    const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
    return new Promise((resolve, reject) => {
      this.socket.send(buf, (err) => {
        if (err) {
          console.error('[X32Driver] Error sending raw payload:', err);
          return reject(err);
        }
        console.log(`[X32Driver] Sent raw payload (${buf.length} bytes)`);
        resolve();
      });
    });
  }
}

module.exports = X32Driver;

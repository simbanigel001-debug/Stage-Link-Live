'use strict';

const dgram = require('dgram');

class StudioLiveDriver {
  /**
   * Create a driver for a PreSonus StudioLive Series III mixer over UDP.
   * @param {string} ip - Mixer IP address
   * @param {number} port - Mixer UDP port
   */
  constructor(ip, port) {
    if (!ip || !port) {
      throw new Error('StudioLiveDriver requires ip and port.');
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
      console.log(`[StudioLiveDriver] Already connected to ${this.ip}:${this.port}`);
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket('udp4');

      this.socket.on('error', this._onError);
      this.socket.on('message', this._onMessage);

      try {
        this.socket.connect(this.port, this.ip, (err) => {
          if (err) {
            console.error(`[StudioLiveDriver] Failed to connect UDP socket to ${this.ip}:${this.port}:`, err);
            this.socket.close();
            this.socket = null;
            return reject(err);
          }
          this.connected = true;
          console.log(`[StudioLiveDriver] UDP socket connected to ${this.ip}:${this.port}`);
          resolve();
        });
      } catch (ex) {
        console.error(`[StudioLiveDriver] Exception while connecting:`, ex);
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

    const normalized = Math.max(0, Math.min(1, levelPercent / 100));
    const messageBuffer = this._buildFaderMessage(channelIndex, normalized);

    return new Promise((resolve, reject) => {
      this.socket.send(messageBuffer, (err) => {
        if (err) {
          console.error(`[StudioLiveDriver] Error sending fader for channel ${channelIndex}:`, err);
          return reject(err);
        }
        console.log(`[StudioLiveDriver] Sent volume ${levelPercent}% (=${normalized.toFixed(3)}) to channel ${channelIndex}`);
        resolve();
      });
    });
  }

  disconnect() {
    if (!this.socket) {
      console.log('[StudioLiveDriver] No socket to disconnect.');
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
        console.log(`[StudioLiveDriver] Socket closed (was connected to ${this.ip}:${this.port}).`);
      });
    } catch (ex) {
      console.error('[StudioLiveDriver] Error closing socket:', ex);
    } finally {
      this.socket = null;
      this.connected = false;
    }
  }

  _buildFaderMessage(channelIndex, normalizedValue) {
    // Default text command; replace with OSC/binary protocol if required by the mixer.
    const text = `FADER ${channelIndex} ${normalizedValue.toFixed(3)}`;
    return Buffer.from(text, 'utf8');
  }

  _onMessage(msg, rinfo) {
    console.log(`[StudioLiveDriver] Received UDP message from ${rinfo.address}:${rinfo.port} - ${msg.length} bytes`);
    const preview = msg.length > 200 ? msg.slice(0, 200) : msg;
    try {
      console.log(preview.toString('utf8'));
    } catch (e) {
      console.log('<binary data>');
    }
  }

  _onError(err) {
    console.error('[StudioLiveDriver] Socket error:', err);
  }

  sendRaw(payload) {
    if (!this.connected || !this.socket) {
      return Promise.reject(new Error('Not connected. Call connect() before sendRaw.'));
    }
    const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
    return new Promise((resolve, reject) => {
      this.socket.send(buf, (err) => {
        if (err) {
          console.error('[StudioLiveDriver] Error sending raw payload:', err);
          return reject(err);
        }
        console.log(`[StudioLiveDriver] Sent raw payload (${buf.length} bytes)`);
        resolve();
      });
    });
  }
}

module.exports = StudioLiveDriver;

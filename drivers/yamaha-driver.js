'use strict';

const net = require('net');

class YamahaDriver {
  /**
   * Create a driver for a Yamaha digital mixer over TCP via RCP protocol.
   * @param {string} ip - Mixer IP address
   * @param {number} port - Mixer TCP port (default 49280 for Yamaha RCP)
   */
  constructor(ip, port) {
    if (!ip || !port) {
      throw new Error('YamahaDriver requires ip and port.');
    }
    this.ip = ip;
    this.port = port;
    this.socket = null;
    this.connected = false;
    this._onData = this._onData.bind(this);
    this._onError = this._onError.bind(this);
    this._onClose = this._onClose.bind(this);
  }

  connect() {
    if (this.connected) {
      console.log(`[YamahaDriver] Already connected to ${this.ip}:${this.port}`);
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        this.socket = net.createConnection({
          host: this.ip,
          port: this.port,
          timeout: 5000
        });

        this.socket.on('connect', () => {
          this.connected = true;
          console.log(`[YamahaDriver] TCP socket connected to ${this.ip}:${this.port}`);
          resolve();
        });

        this.socket.on('data', this._onData);
        this.socket.on('error', this._onError);
        this.socket.on('close', this._onClose);

        this.socket.on('timeout', () => {
          console.error(`[YamahaDriver] Connection timeout to ${this.ip}:${this.port}`);
          this.socket.destroy();
          reject(new Error('Connection timeout'));
        });
      } catch (ex) {
        console.error(`[YamahaDriver] Exception while connecting:`, ex);
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

    // Convert percentage to dB value and build Yamaha RCP command
    const command = this._buildYamahaRcpCommand(channelIndex, levelPercent);

    return new Promise((resolve, reject) => {
      try {
        this.socket.write(command, 'utf8', (err) => {
          if (err) {
            console.error(`[YamahaDriver] Error sending volume command for channel ${channelIndex}:`, err);
            return reject(err);
          }
          console.log(`[YamahaDriver] Sent volume ${levelPercent}% to channel ${channelIndex}`);
          resolve();
        });
      } catch (ex) {
        console.error(`[YamahaDriver] Exception while writing to socket:`, ex);
        reject(ex);
      }
    });
  }

  disconnect() {
    if (!this.socket) {
      console.log('[YamahaDriver] No socket to disconnect.');
      this.connected = false;
      return;
    }

    try {
      this.socket.removeListener('data', this._onData);
      this.socket.removeListener('error', this._onError);
      this.socket.removeListener('close', this._onClose);
    } catch (e) {
      // ignore if not supported
    }

    try {
      this.socket.destroy();
      this.connected = false;
      console.log(`[YamahaDriver] Socket destroyed (was connected to ${this.ip}:${this.port}).`);
    } catch (ex) {
      console.error('[YamahaDriver] Error closing socket:', ex);
    } finally {
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * Convert percentage to dB and build Yamaha RCP fader command.
   * Yamaha RCP uses dB values for channel volume.
   * 0% = -inf dB (mute or minimum), 100% = 0 dB (unity/maximum)
   * Common formula: dB = -60 + (levelPercent / 100) * 60
   * Resulting in: 0% = -60 dB, 100% = 0 dB
   *
   * Yamaha RCP command format: CH {channel} FADER {dB value}
   * Terminated with newline character
   *
   * @param {number} channelIndex - Channel number (typically 1-based for Yamaha)
   * @param {number} levelPercent - Volume level 0-100%
   * @returns {string} Yamaha RCP command string
   */
  _buildYamahaRcpCommand(channelIndex, levelPercent) {
    // Convert percentage to dB (range: -60 to 0 dB)
    // At 0%: -60 dB (effectively muted)
    // At 100%: 0 dB (unity/maximum)
    const dbValue = -60 + (levelPercent / 100) * 60;

    // Format dB value to 1 decimal place for precision
    const dbFormatted = dbValue.toFixed(1);

    // Build Yamaha RCP command
    // Format: "CH {channel} FADER {dB}\n"
    const command = `CH ${channelIndex} FADER ${dbFormatted}\n`;

    return command;
  }

  _onData(data) {
    console.log(`[YamahaDriver] Received data from ${this.ip}:${this.port} - ${data.length} bytes`);
    try {
      const text = data.toString('utf8').trim();
      if (text) {
        console.log(`[YamahaDriver] Response: ${text}`);
      }
    } catch (e) {
      console.log('[YamahaDriver] <binary data>');
    }
  }

  _onError(err) {
    console.error('[YamahaDriver] Socket error:', err);
    this.connected = false;
  }

  _onClose() {
    console.log(`[YamahaDriver] Socket closed (was connected to ${this.ip}:${this.port}).`);
    this.connected = false;
  }

  /**
   * Send a raw Yamaha RCP command.
   * @param {string} command - Yamaha RCP command (should include newline terminator)
   * @returns {Promise<void>}
   */
  sendRaw(command) {
    if (!this.connected || !this.socket) {
      return Promise.reject(new Error('Not connected. Call connect() before sendRaw.'));
    }

    // Ensure command ends with newline
    const cmdWithNewline = command.endsWith('\n') ? command : command + '\n';

    return new Promise((resolve, reject) => {
      try {
        this.socket.write(cmdWithNewline, 'utf8', (err) => {
          if (err) {
            console.error('[YamahaDriver] Error sending raw command:', err);
            return reject(err);
          }
          console.log(`[YamahaDriver] Sent raw command: ${cmdWithNewline.trim()}`);
          resolve();
        });
      } catch (ex) {
        console.error('[YamahaDriver] Exception while sending raw command:', ex);
        reject(ex);
      }
    });
  }
}

module.exports = YamahaDriver;

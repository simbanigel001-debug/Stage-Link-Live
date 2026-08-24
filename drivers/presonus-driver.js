// drivers/presonus-driver.js
const net = require('net');

class PreSonusDriver {
  constructor(config = {}) {
    this.name = 'PreSonus';
    this.ip = config.ip || '192.168.1.110';
    this.port = config.port || 53000;
    this.client = null;
    this.connected = false;
  }

  connect() {
    console.log(`[PreSonus UC-Net Driver] Connecting to ${this.ip}:${this.port}...`);
    this.client = new net.Socket();

    this.client.connect(this.port, this.ip, () => {
      this.connected = true;
      console.log(`[PreSonus UC-Net Driver] Connected to ${this.ip}`);
      this.handshake();
    });

    this.client.on('error', (err) => {
      console.error('[PreSonus Driver] Error:', err.message);
    });
  }

  handshake() {
    // Basic UC-Net subscriber initiation packet
    const initPacket = Buffer.from('UC\x00\x01\x00\x00\x00\x00', 'binary');
    this.client.write(initPacket);
  }

  disconnect() {
    if (this.client) this.client.destroy();
  }

  setChannelLevel(channel, level) {
    if (!this.connected) return;
    const jsonPayload = JSON.stringify({
      msg: `line/ch${channel}/volume`,
      value: Math.max(0.0, Math.min(1.0, level))
    });
    this.sendUCPacket(jsonPayload);
  }

  setBusSendPan(channel, bus, pan) {
    if (!this.connected) return;
    const normalizedPan = (pan + 1.0) / 2.0; // Map -1..1 to 0..1
    const jsonPayload = JSON.stringify({
      msg: `line/ch${channel}/aux${bus}/pan`,
      value: normalizedPan
    });
    this.sendUCPacket(jsonPayload);
  }

  sendUCPacket(jsonStr) {
    const header = Buffer.from('UC', 'ascii');
    const lengthBuf = Buffer.alloc(2);
    lengthBuf.writeUInt16LE(jsonStr.length, 0);
    const payload = Buffer.from(jsonStr, 'utf8');

    const packet = Buffer.concat([header, lengthBuf, payload]);
    this.client.write(packet);
  }
}

module.exports = PreSonusDriver;

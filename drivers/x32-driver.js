// drivers/x32-driver.js
const dgram = require('dgram');

class X32Driver {
  constructor(config = {}) {
    this.name = 'X32';
    this.ip = config.ip || '192.168.1.100';
    this.port = config.port || 10023; // Default X32 OSC port
    this.client = dgram.createSocket('udp4');
    this.keepAliveInterval = null;
  }

  connect() {
    console.log(`[X32 Driver] Binding UDP client for ${this.ip}:${this.port}...`);
    
    // X32 requires a periodic `/xremote` OSC string to keep receiving state updates
    this.sendOSC('/xremote');
    this.keepAliveInterval = setInterval(() => {
      this.sendOSC('/xremote');
    }, 8000);

    this.client.on('message', (msg) => {
      // Incoming OSC telemetry handling from physical console
    });
  }

  disconnect() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.client.close();
    console.log('[X32 Driver] Disconnected.');
  }

  // Set main input channel fader level (0.0 to 1.0)
  setChannelLevel(channel, level) {
    const chPadded = String(channel).padStart(2, '0');
    const oscAddress = `/ch/${chPadded}/mix/fader`;
    this.sendOSCFloat(oscAddress, Math.max(0.0, Math.min(1.0, level)));
  }

  // Set bus/aux send level for a channel (IEM Mixes)
  setBusSendLevel(channel, bus, level) {
    const chPadded = String(channel).padStart(2, '0');
    const busPadded = String(bus).padStart(2, '0');
    const oscAddress = `/ch/${chPadded}/mix/${busPadded}/level`;
    this.sendOSCFloat(oscAddress, Math.max(0.0, Math.min(1.0, level)));
  }

  // Set bus/aux send pan for spatial IEM positioning
  setBusSendPan(channel, bus, pan) {
    const chPadded = String(channel).padStart(2, '0');
    const busPadded = String(bus).padStart(2, '0');
    const oscAddress = `/ch/${chPadded}/mix/${busPadded}/pan`;
    // Map -1.0..+1.0 pan to X32 float range 0.0..1.0
    const normalizedPan = (pan + 1.0) / 2.0;
    this.sendOSCFloat(oscAddress, Math.max(0.0, Math.min(1.0, normalizedPan)));
  }

  // Basic OSC String Packet Builder
  sendOSC(address) {
    const buf = Buffer.from(this.padOSC(address) + ',s\0\0\0\0');
    this.client.send(buf, 0, buf.length, this.port, this.ip);
  }

  // Basic OSC Float Packet Builder
  sendOSCFloat(address, value) {
    const addrBuf = Buffer.from(this.padOSC(address));
    const typeBuf = Buffer.from(',f\0\0');
    const valBuf = Buffer.alloc(4);
    valBuf.writeFloatBE(value, 0);

    const message = Buffer.concat([addrBuf, typeBuf, valBuf]);
    this.client.send(message, 0, message.length, this.port, this.ip);
  }

  padOSC(str) {
    const nulls = 4 - (str.length % 4);
    return str + '\0'.repeat(nulls);
  }
}

module.exports = X32Driver;

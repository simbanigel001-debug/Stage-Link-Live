// drivers/yamaha-driver.js
const net = require('net');

class YamahaDriver {
  constructor(config = {}) {
    this.name = 'Yamaha';
    this.ip = config.ip || '192.168.1.120';
    this.port = config.port || 49280;
    this.client = null;
    this.connected = false;
  }

  connect() {
    console.log(`[Yamaha SCP Driver] Connecting to ${this.ip}:${this.port}...`);
    this.client = new net.Socket();

    this.client.connect(this.port, this.ip, () => {
      this.connected = true;
      console.log(`[Yamaha SCP Driver] Connected to ${this.ip}`);
    });

    this.client.on('error', (err) => {
      console.error('[Yamaha SCP Driver] Error:', err.message);
    });

    this.client.on('close', () => {
      this.connected = false;
      console.log('[Yamaha SCP Driver] Connection closed.');
    });
  }

  disconnect() {
    if (this.client) this.client.destroy();
  }

  // Set input channel level (0.0 - 1.0 converted to Yamaha -32768 to 1000 millibels range)
  setChannelLevel(channel, level) {
    if (!this.connected) return;
    // Map 0.0..1.0 to Yamaha internal fader steps (-9600 to 1000)
    const yValue = Math.round(level * 10600 - 9600);
    const command = `set MIXER:Current/InCh/Fader/Level ${channel - 1} 0 ${yValue}\n`;
    this.client.write(command);
  }

  // Set Aux / Mix send pan for spatial IEM positioning
  setBusSendPan(channel, bus, pan) {
    if (!this.connected) return;
    // Map -1.0..+1.0 pan to Yamaha range (-63 to +63)
    const yPan = Math.round(pan * 63);
    const command = `set MIXER:Current/InCh/ToMix/Pan ${channel - 1} ${bus - 1} ${yPan}\n`;
    this.client.write(command);
  }
}

module.exports = YamahaDriver;

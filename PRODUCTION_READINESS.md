# StageLink Live — Production Readiness & Hardware Abstraction Checklist

**Version:** 0.1 → v1.0 (Production)  
**Purpose:** Guide the transition from simulated 16-channel mock inputs to real-time StudioLive hardware integration.  
**Target Hardware:** PreSonus StudioLive Series (MIDI/OSC output)  
**Target Environment:** Stage deployment with wired earphone monitoring via Wi-Fi  

---

## Phase 1: API Abstraction Layer

### 1.1 Audio Channel Abstraction (CRITICAL)

**Current State (v0.1):**
- Mock 16-channel array hardcoded in `server.js` (lines 58–76)
- Simulated random values (sine-wave activity in `public/index.html` lines 256–272)
- No real hardware connection

**Migration Path:**

#### Step 1A: Create Hardware Input Adapter Interface

Create a new file: `src/hardware/audioChannelAdapter.js`

```javascript
/**
 * Abstract base class for audio channel inputs.
 * All hardware backends must implement this interface.
 */
class AudioChannelAdapter {
  /**
   * Initialize connection to hardware
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('Not implemented');
  }

  /**
   * Get current channel state (name, level, muted, pan, etc.)
   * @param {number} channelId - Channel index (0-15)
   * @returns {Promise<Object>} { id, name, level, muted, pan, ... }
   */
  async getChannelState(channelId) {
    throw new Error('Not implemented');
  }

  /**
   * Get all 16 channels at once
   * @returns {Promise<Array>} Array of channel objects
   */
  async getAllChannels() {
    throw new Error('Not implemented');
  }

  /**
   * Subscribe to real-time channel updates
   * @param {Function} callback - (channelId, state) => {}
   * @returns {Promise<void>}
   */
  async subscribeToChannelUpdates(callback) {
    throw new Error('Not implemented');
  }

  /**
   * Disconnect from hardware
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('Not implemented');
  }
}

module.exports = AudioChannelAdapter;
```

#### Step 1B: Implement Mock Adapter (v0.1 Baseline)

Create: `src/hardware/adapters/MockAudioAdapter.js`

```javascript
const AudioChannelAdapter = require('../audioChannelAdapter');

class MockAudioAdapter extends AudioChannelAdapter {
  constructor() {
    super();
    this.channels = [
      { id: 1, name: 'kick', level: 0.7, muted: false, pan: 0 },
      { id: 2, name: 'snare', level: 0.6, muted: false, pan: 0 },
      // ... (16 total)
    ];
    this.updateInterval = null;
  }

  async initialize() {
    console.log('[MockAdapter] Initialized (simulated mode)');
  }

  async getChannelState(channelId) {
    return this.channels[channelId - 1] || null;
  }

  async getAllChannels() {
    return this.channels;
  }

  async subscribeToChannelUpdates(callback) {
    // Simulate live updates every 200ms
    this.updateInterval = setInterval(() => {
      this.channels.forEach((ch, idx) => {
        ch.level = Math.max(0.1, Math.abs(Math.sin(Date.now() / 700 + idx) * 0.8));
        callback(idx, ch);
      });
    }, 200);
  }

  async disconnect() {
    if (this.updateInterval) clearInterval(this.updateInterval);
  }
}

module.exports = MockAudioAdapter;
```

#### Step 1C: Implement StudioLive MIDI Adapter

Create: `src/hardware/adapters/StudioLiveMidiAdapter.js`

```javascript
const AudioChannelAdapter = require('../audioChannelAdapter');
const midi = require('midi'); // npm install midi

class StudioLiveMidiAdapter extends AudioChannelAdapter {
  constructor(options = {}) {
    super();
    this.deviceName = options.deviceName || 'StudioLive';
    this.midiInput = new midi.input();
    this.channels = Array.from({ length: 16 }, (_, i) => ({
      id: i + 1,
      name: `Channel ${i + 1}`,
      level: 0,
      muted: false,
      pan: 0
    }));
    this.midiChannelMap = options.midiChannelMap || this._defaultMidiMap();
  }

  _defaultMidiMap() {
    // Map MIDI CC messages to channel levels
    // Example: CC 16-31 = channels 1-16 volume
    return Array.from({ length: 16 }, (_, i) => ({
      cc: 16 + i,
      channel: i + 1
    }));
  }

  async initialize() {
    try {
      const inputs = this.midiInput.getPortCount();
      console.log(`[StudioLiveMidiAdapter] Found ${inputs} MIDI inputs`);
      
      let found = false;
      for (let i = 0; i < inputs; i++) {
        const name = this.midiInput.getPortName(i);
        if (name.includes(this.deviceName)) {
          this.midiInput.openPort(i);
          console.log(`[StudioLiveMidiAdapter] Connected to ${name}`);
          found = true;
          break;
        }
      }
      
      if (!found) {
        throw new Error(`MIDI device "${this.deviceName}" not found`);
      }
    } catch (err) {
      console.error('[StudioLiveMidiAdapter] Init error:', err.message);
      throw err;
    }
  }

  async getChannelState(channelId) {
    return this.channels[channelId - 1] || null;
  }

  async getAllChannels() {
    return this.channels;
  }

  async subscribeToChannelUpdates(callback) {
    this.midiInput.on('message', (deltaTime, message) => {
      const [status, cc, value] = message;
      
      // Extract channel from MIDI CC
      const mapping = this.midiChannelMap.find(m => m.cc === cc);
      if (mapping) {
        const channelIdx = mapping.channel - 1;
        this.channels[channelIdx].level = value / 127; // Normalize 0-127 to 0-1
        callback(channelIdx, this.channels[channelIdx]);
      }
    });
  }

  async disconnect() {
    if (this.midiInput) this.midiInput.closePort();
  }
}

module.exports = StudioLiveMidiAdapter;
```

#### Step 1D: Implement StudioLive OSC Adapter

Create: `src/hardware/adapters/StudioLiveOscAdapter.js`

```javascript
const AudioChannelAdapter = require('../audioChannelAdapter');
const osc = require('osc'); // npm install osc

class StudioLiveOscAdapter extends AudioChannelAdapter {
  constructor(options = {}) {
    super();
    this.oscPort = new osc.UDPPort({
      localAddress: options.localAddress || '0.0.0.0',
      localPort: options.localPort || 9000,
      remoteAddress: options.remoteAddress || '192.168.1.100', // StudioLive IP
      remotePort: options.remotePort || 10024,
      metadata: true
    });
    
    this.channels = Array.from({ length: 16 }, (_, i) => ({
      id: i + 1,
      name: `Channel ${i + 1}`,
      level: 0,
      muted: false,
      pan: 0
    }));
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.oscPort.on('ready', () => {
        console.log('[StudioLiveOscAdapter] OSC port ready and listening');
        resolve();
      });
      
      this.oscPort.on('error', (err) => {
        console.error('[StudioLiveOscAdapter] OSC error:', err);
        reject(err);
      });
      
      this.oscPort.open();
    });
  }

  async getChannelState(channelId) {
    return this.channels[channelId - 1] || null;
  }

  async getAllChannels() {
    return this.channels;
  }

  async subscribeToChannelUpdates(callback) {
    // Listen for StudioLive fader updates
    // StudioLive sends OSC messages like: /ch/01/mix/fader
    this.oscPort.on('message', (oscMsg) => {
      const { address, args } = oscMsg;
      
      // Parse address: /ch/01/mix/fader -> channel 1
      const match = address.match(/\/ch\/(\d+)\/mix\/fader/);
      if (match) {
        const channelId = parseInt(match[1], 10);
        const level = args[0].value; // OSC value (typically 0-1)
        
        const channelIdx = channelId - 1;
        this.channels[channelIdx].level = level;
        callback(channelIdx, this.channels[channelIdx]);
      }
    });
  }

  async disconnect() {
    if (this.oscPort) this.oscPort.close();
  }
}

module.exports = StudioLiveOscAdapter;
```

#### Step 1E: Integrate Adapter into server.js

Modify `server.js`:

```javascript
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

// Import adapters
const MockAudioAdapter = require('./src/hardware/adapters/MockAudioAdapter');
const StudioLiveOscAdapter = require('./src/hardware/adapters/StudioLiveOscAdapter');
const StudioLiveMidiAdapter = require('./src/hardware/adapters/StudioLiveMidiAdapter');

// Initialize Express application
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============ HARDWARE ABSTRACTION ============
// Select adapter based on environment variable
const HARDWARE_MODE = process.env.HARDWARE_MODE || 'mock'; // mock | osc | midi
let audioAdapter;

async function initializeAudioAdapter() {
  if (HARDWARE_MODE === 'osc') {
    audioAdapter = new StudioLiveOscAdapter({
      remoteAddress: process.env.STUDIOLIVE_IP || '192.168.1.100',
      remotePort: parseInt(process.env.STUDIOLIVE_OSC_PORT || 10024),
      localPort: parseInt(process.env.LOCAL_OSC_PORT || 9000)
    });
  } else if (HARDWARE_MODE === 'midi') {
    audioAdapter = new StudioLiveMidiAdapter({
      deviceName: process.env.MIDI_DEVICE_NAME || 'StudioLive'
    });
  } else {
    audioAdapter = new MockAudioAdapter();
  }
  
  await audioAdapter.initialize();
  console.log(`[Server] Audio adapter initialized: ${HARDWARE_MODE}`);
}

// ============ MUSICIANS & STATE ============
const musicians = [ /* ... */ ];
let audioChannels = [];

// ============ API ENDPOINTS ============
app.get('/api/state', (req, res) => {
  res.json({ musicians, audioChannels });
});

// POST to add musician (unchanged)
app.post('/api/musicians', (req, res) => {
  // ... existing code
});

// ============ WEBSOCKET ============
io.on('connection', (socket) => {
  socket.emit('initial_state', { musicians, audioChannels });
  
  socket.on('update_mix', (data) => {
    // ... existing code
  });
  
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// ============ ERROR HANDLING & STARTUP ============
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await initializeAudioAdapter();
    
    // Subscribe to real-time channel updates
    await audioAdapter.subscribeToChannelUpdates((channelIdx, state) => {
      audioChannels[channelIdx] = state;
      // Broadcast to all connected clients
      io.emit('channel_update', { channelIdx, state });
    });
    
    // Fetch initial channel state
    audioChannels = await audioAdapter.getAllChannels();
    
    server.listen(PORT, () => {
      console.log(`StageLink Live server running on port ${PORT}`);
      console.log(`Hardware mode: ${HARDWARE_MODE}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('[Server] Startup error:', err);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down gracefully...');
  await audioAdapter.disconnect();
  server.close(() => {
    console.log('[Server] Closed');
    process.exit(0);
  });
});
```

---

### 1.2 Musician Mix State Management (CRITICAL)

**Current State:**
- Mix stored in memory on server
- No persistence
- No real-time sync with hardware faders

**Migration Path:**

#### Step 2A: Create Mix State Adapter

Create: `src/hardware/mixStateAdapter.js`

```javascript
/**
 * Abstracts how musician mix states are persisted and synced with hardware
 */
class MixStateAdapter {
  /**
   * Load mix state for a musician from storage/hardware
   * @param {string} musicianId
   * @returns {Promise<Object>} Mix state
   */
  async loadMixState(musicianId) {
    throw new Error('Not implemented');
  }

  /**
   * Save mix state for a musician
   * @param {string} musicianId
   * @param {Object} mixState
   * @returns {Promise<void>}
   */
  async saveMixState(musicianId, mixState) {
    throw new Error('Not implemented');
  }

  /**
   * Sync mix state changes to hardware (e.g., StudioLive auxiliaries)
   * @param {string} musicianId
   * @param {Object} mixUpdate
   * @returns {Promise<void>}
   */
  async syncToHardware(musicianId, mixUpdate) {
    throw new Error('Not implemented');
  }
}

module.exports = MixStateAdapter;
```

#### Step 2B: Implement In-Memory + Hardware Sync Adapter

Create: `src/hardware/adapters/HardwareMixAdapter.js`

```javascript
const MixStateAdapter = require('../mixStateAdapter');

class HardwareMixAdapter extends MixStateAdapter {
  constructor(options = {}) {
    super();
    this.store = new Map(); // In-memory store
    this.oscPort = options.oscPort; // OSC connection to StudioLive (if available)
    this.midiOutput = options.midiOutput; // MIDI output (if available)
  }

  async loadMixState(musicianId) {
    return this.store.get(musicianId) || this._defaultMixState();
  }

  async saveMixState(musicianId, mixState) {
    this.store.set(musicianId, mixState);
  }

  async syncToHardware(musicianId, mixUpdate) {
    // Example: Sync to StudioLive auxiliary channels
    // Musician 1 -> Aux 1, Musician 2 -> Aux 2, etc.
    
    if (this.oscPort) {
      // Send OSC message to StudioLive
      // /aux/01/mix/fader [0-1]
      const auxChannel = parseInt(musicianId) || 1;
      const message = {
        address: `/aux/${String(auxChannel).padStart(2, '0')}/mix/fader`,
        args: [{ type: 'f', value: mixUpdate.volume || 0.5 }]
      };
      this.oscPort.send(message);
    }
    
    if (this.midiOutput) {
      // Send MIDI CC to StudioLive
      // CC 48-63 = Aux 1-16 faders
      const cc = 48 + (parseInt(musicianId) || 1) - 1;
      const midiValue = Math.round((mixUpdate.volume || 0.5) * 127);
      this.midiOutput.sendControlChange(cc, midiValue);
    }
  }

  _defaultMixState() {
    return {
      volume: 0.5,
      pan: 0,
      mute: false,
      solo: false,
      eq: { low: 0, mid: 0, high: 0 }
    };
  }
}

module.exports = HardwareMixAdapter;
```

---

### 1.3 Configuration Management

Create: `.env.production.example`

```bash
# ============ PRODUCTION HARDWARE CONFIG ============

# Hardware Mode: mock | osc | midi
HARDWARE_MODE=osc

# -------- OSC Configuration --------
# StudioLive mixer IP address on stage network
STUDIOLIVE_IP=192.168.1.100

# OSC port on StudioLive (default PreSonus is 10024)
STUDIOLIVE_OSC_PORT=10024

# Local port to listen for OSC messages from StudioLive
LOCAL_OSC_PORT=9000

# -------- MIDI Configuration --------
# MIDI device name to connect to
MIDI_DEVICE_NAME=StudioLive

# -------- Network Config --------
# Bind to all interfaces for stage network (0.0.0.0)
BIND_ADDRESS=0.0.0.0

# Port for engineer dashboard
PORT=3000

# -------- Logging --------
LOG_LEVEL=info
NODE_ENV=production
```

---

## Phase 2: Network Optimization for Ultra-Low Latency

### 2.1 Wi-Fi Network Architecture (CRITICAL)

**Target Requirements:**
- **Latency:** < 20ms round-trip (wired in-ear monitors)
- **Jitter:** < 5ms
- **Bandwidth per musician:** ~500 Kbps (high-quality audio would be higher; currently using control updates)

### 2.1.1 Stage Wi-Fi Router Setup

Create: `docs/STAGE_NETWORK_SETUP.md`

```markdown
# Stage Network Configuration for StageLink Live

## Hardware Requirements

### Recommended Equipment
- **Router:** Ubiquiti Unifi 6 (6E dual-band), Cisco Meraki MR46, or Arista Instant On
  - **Why:** Enterprise-grade with QoS, failover, and band steering
  - **Minimum:** 802.11ac (Wi-Fi 5) or 802.11ax (Wi-Fi 6)
  
- **Backhaul:** Wired Ethernet from mixing console to router (critical)
  
- **Access Point Placement:**
  - Position 1-2 access points on stage (line-of-sight to all performers)
  - Avoid metal/RF-shielded stage structures
  - Keep distance < 30 meters for musicians

### Network Topology

```
    ┌─────────────────┐
    │   Stage Router  │ (5GHz Band: "StageLink-Band5G")
    │   (Mesh Master) │ (2.4GHz Band: "StageLink-Backup")
    └────────┬────────┘
             │ (Wired Ethernet from console)
             │
    ┌────────┴────────────────┐
    │                         │
┌───────┐                ┌──────────┐
│ Mixer │                │ Engineer │
│Console│                │ Laptop   │
└───────┘                └──────────┘
    │
    ├─ Kick Drum ──────────→ [Phone 1] (5GHz)
    ├─ Bass ───────────────→ [Phone 2] (5GHz)
    └─ Vocals ─────────────→ [Phone 3] (5GHz)
```

## Wi-Fi Band Selection

### 5GHz Band (Preferred for Performers)
- **Name:** `StageLink-Band5G` (hidden SSID optional)
- **Channel Width:** 80 MHz (channels 36-48, 52-144, 149-165)
- **Recommended Channels:** 36, 40, 44, 48 (US) or 36, 40, 44, 48, 52, 56, 60, 64 (EU)
- **Transmit Power:** Maximum (30 dBm / 1W)
- **RTS Threshold:** 2347 (disabled)
- **Fragmentation Threshold:** 2346 (disabled)

### 2.4GHz Band (Backup/Fallback)
- **Name:** `StageLink-Backup` (for legacy devices)
- **Channel:** 1, 6, or 11 only (avoid overlap)
- **Transmit Power:** Maximum (20 dBm / 100mW)
- **Enable:** Band steering (prefer 5GHz clients to 5GHz)

## QoS Configuration

### Priority Rules (Ubiquiti Unifi Example)

1. **StageLink Audio Control** (High Priority - must-have)
   - Protocol: UDP
   - Ports: 3000, 9000 (OSC), 5000 (MIDI)
   - Guaranteed Bandwidth: 2 Mbps per device
   - Max Bandwidth: 5 Mbps per device
   - Rate Limiting: Enable burst up to 10 Mbps

2. **Engineer Dashboard** (Medium Priority)
   - Protocol: TCP
   - Port: 3000
   - Guaranteed: 1 Mbps
   - Max: 10 Mbps

3. **Best Effort** (Low Priority)
   - All other traffic
   - Max: 5 Mbps per device

### Latency Optimization
- **Enable:** Low Latency QoS (prioritize control packets over bulk data)
- **Disable:** AutoChannelSelect on 5GHz (manually select to avoid interference)
- **Enable:** Fast Roaming (802.11k/v/w) to minimize handoff latency

## Security Configuration

### Wi-Fi Security
- **Authentication:** WPA3 (or WPA2 if WPA3 unavailable)
- **Encryption:** AES-256 (CCMP)
- **Pre-Shared Key (PSK):** High entropy, rotated weekly on stage
- **Network Isolation:** VLAN for StageLink devices only (optional)

### Example PSK Format
```
Stage-2025-Week-42-SecureKey123!
```

## Failover Strategy

### Primary Connection
- Wi-Fi 5GHz band (primary for all performers)

### Fallback Connections
1. Wi-Fi 2.4GHz band (if 5GHz drops)
2. Mobile hotspot from engineer's phone (as emergency backup)
3. Wired Ethernet for engineer laptop (never wireless for console control)

## Monitoring & Troubleshooting

### Key Metrics to Monitor
```bash
# On router (SSH access):
# Check signal strength and data rates
iwconfig

# Monitor latency (from engineer laptop)
ping -D <performer-phone-ip>  # Should be < 10ms

# Check for packet loss
ping -c 100 <performer-phone-ip> | grep -oP '(\d+)(?=% packet loss)'

# Verify channel interference
site:survey  # Ubiquiti Unifi command
```

### Debugging Commands

**On Performer Phone (via SSH or serial):**
```bash
# Monitor Wi-Fi connection quality
adb shell dumpsys wifistats

# Check RSSI (signal strength) - should be > -60 dBm
adb shell wpa_cli signal_poll
```

**On Engineer Laptop:**
```bash
# Monitor latency in real-time
iperf -u -c <stage-router-ip> -t 60  # UDP throughput and latency

# Check for jitter
mtr -u <performer-phone-ip>  # Multi-packet latency trace
```

### Network Optimization Checklist
- [ ] Router location tested (minimum 2-3 line-of-sight positions)
- [ ] 5GHz band interference survey completed
- [ ] Latency verified < 20ms round-trip (ping)
- [ ] QoS rules configured and tested
- [ ] Failover mechanism tested (Wi-Fi 2.4GHz, hotspot)
- [ ] Security credentials set and documented
- [ ] Performer devices pre-connected to network during sound check
- [ ] Real-time monitoring dashboard active during performance
```

### 2.1.2 Client-Side Network Optimization

Create: `src/network/latencyOptimization.js`

```javascript
/**
 * Client-side latency optimization for musician devices
 */
class LatencyOptimization {
  constructor() {
    this.stats = {
      lastPingTime: null,
      roundTripLatency: [],
      jitter: 0,
      packetLoss: 0
    };
  }

  /**
   * Measure round-trip latency to server
   */
  async measureLatency() {
    const startTime = performance.now();
    
    try {
      const response = await fetch('/api/health', {
        cache: 'no-store',
        method: 'HEAD'
      });
      
      const endTime = performance.now();
      const latency = endTime - startTime;
      
      this.stats.roundTripLatency.push(latency);
      if (this.stats.roundTripLatency.length > 50) {
        this.stats.roundTripLatency.shift(); // Keep last 50 measurements
      }
      
      this.calculateJitter();
      return latency;
    } catch (err) {
      console.warn('[LatencyOptimization] Ping failed:', err);
      this.stats.packetLoss++;
      return null;
    }
  }

  calculateJitter() {
    if (this.stats.roundTripLatency.length < 2) return;
    
    const latencies = this.stats.roundTripLatency;
    const diffs = [];
    
    for (let i = 1; i < latencies.length; i++) {
      diffs.push(Math.abs(latencies[i] - latencies[i - 1]));
    }
    
    this.stats.jitter = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  }

  /**
   * Get average latency
   */
  getAverageLatency() {
    if (this.stats.roundTripLatency.length === 0) return null;
    const sum = this.stats.roundTripLatency.reduce((a, b) => a + b, 0);
    return sum / this.stats.roundTripLatency.length;
  }

  /**
   * Check network health
   * @returns {Object} { healthy: boolean, latency, jitter, packetLoss }
   */
  getNetworkHealth() {
    const avgLatency = this.getAverageLatency();
    const healthy = 
      avgLatency !== null &&
      avgLatency < 20 &&  // < 20ms
      this.stats.jitter < 5;  // < 5ms jitter
    
    return {
      healthy,
      latency: avgLatency,
      jitter: this.stats.jitter,
      packetLoss: this.stats.packetLoss,
      status: healthy ? 'OPTIMAL' : (avgLatency < 50 ? 'ACCEPTABLE' : 'DEGRADED')
    };
  }

  /**
   * Start continuous latency monitoring
   * @param {number} intervalMs - Polling interval (default 5000ms)
   * @param {Function} onStatusChange - Callback when network status changes
   */
  startMonitoring(intervalMs = 5000, onStatusChange = null) {
    let lastStatus = null;
    
    this.monitoringInterval = setInterval(async () => {
      await this.measureLatency();
      const health = this.getNetworkHealth();
      
      if (onStatusChange && health.status !== lastStatus) {
        onStatusChange(health);
        lastStatus = health.status;
      }
    }, intervalMs);
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
}

export default LatencyOptimization;
```

### 2.1.3 Engineer Dashboard Network Monitoring

Create: `public/network-monitor.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>StageLink Network Monitor</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root { color-scheme: dark; }
    body { background: linear-gradient(180deg,#0b0f14,#081018); }
    .health-dot { width: 14px; height: 14px; border-radius: 50%; }
    .health-optimal { background: #10b981; box-shadow: 0 0 10px #10b981; }
    .health-acceptable { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; }
    .health-degraded { background: #ef4444; box-shadow: 0 0 10px #ef4444; }
  </style>
</head>
<body class="text-gray-100 min-h-screen p-6">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-2xl font-semibold mb-4">Stage Network Monitor</h1>
    
    <div id="monitor" class="grid grid-cols-1 gap-4">
      <!-- Device cards will be injected here -->
    </div>
  </div>

  <script src="https://cdn.socket.io/4.6.1/socket.io.min.js"></script>
  <script>
    const socket = io();
    const devices = new Map();

    socket.on('device_latency', (data) => {
      const { deviceId, latency, jitter, status } = data;
      updateDeviceHealth(deviceId, { latency, jitter, status });
    });

    function updateDeviceHealth(deviceId, health) {
      let card = document.getElementById(`device-${deviceId}`);
      
      if (!card) {
        card = document.createElement('div');
        card.id = `device-${deviceId}`;
        card.className = 'bg-gray-800/60 p-4 rounded-lg border border-gray-700';
        document.getElementById('monitor').appendChild(card);
      }
      
      const healthClass = `health-${health.status.toLowerCase()}`;
      card.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center space-x-3">
            <div class="health-dot ${healthClass}"></div>
            <span class="font-medium">${deviceId}</span>
          </div>
          <span class="text-sm text-gray-400">${health.status}</span>
        </div>
        <div class="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div class="text-gray-400">Latency</div>
            <div class="font-mono">${health.latency?.toFixed(1)}ms</div>
          </div>
          <div>
            <div class="text-gray-400">Jitter</div>
            <div class="font-mono">${health.jitter?.toFixed(1)}ms</div>
          </div>
          <div>
            <div class="text-gray-400">Threshold</div>
            <div class="text-xs text-gray-500">< 20ms | < 5ms</div>
          </div>
        </div>
      `;
    }
  </script>
</body>
</html>
```

---

## Phase 3: Deployment Checklist

### 3.1 Pre-Performance Hardware Check

- [ ] **Mixer Console**
  - [ ] StudioLive powered on and on correct IP (192.168.1.100)
  - [ ] OSC output enabled (Menu → Network → OSC Enable)
  - [ ] MIDI output enabled (Menu → Network → MIDI Enable) if using MIDI
  - [ ] All 16 channel inputs verified with test signal

- [ ] **Stage Router**
  - [ ] Wired Ethernet from mixer to router (not Wi-Fi)
  - [ ] 5GHz band broadcasting ("StageLink-Band5G")
  - [ ] 2.4GHz fallback band configured ("StageLink-Backup")
  - [ ] QoS rules loaded and verified
  - [ ] Channel interference survey completed
  - [ ] Signal strength > -60 dBm in all stage areas

- [ ] **Engineer Laptop**
  - [ ] Connected to stage network via Ethernet (wired preferred) or 5GHz Wi-Fi
  - [ ] SSH/Terminal access to router (for monitoring)
  - [ ] Network monitoring tools installed (iperf, mtr, iftop)
  - [ ] Real-time latency dashboard open

- [ ] **Performer Phones**
  - [ ] Pre-connected to "StageLink-Band5G" during sound check
  - [ ] App cache cleared, app restarted
  - [ ] Battery above 80%
  - [ ] Airplane mode OFF, Wi-Fi only (cellular OFF if needed)
  - [ ] In-ear monitor wired connection tested (headset plugged in)

### 3.2 Startup Sequence

```bash
# 1. On engineer laptop, start monitoring dashboard
open http://localhost:3000/network-monitor.html

# 2. Start StageLink server
HARDWARE_MODE=osc STUDIOLIVE_IP=192.168.1.100 npm start

# 3. Verify OSC handshake in logs
# Expected: "[StudioLiveOscAdapter] OSC port ready and listening"

# 4. On each performer phone, scan QR code from engineer dashboard
# Expected: Phone connects, socket connects, mix controls appear

# 5. Perform latency check
ping -c 10 <performer-phone-ip>
# Expected: < 10ms average, < 5ms jitter

# 6. Perform audio I/O check
# - Engineer: Move a fader on mixer, verify it appears on performer phone in < 50ms
# - Performer: Adjust mix level on phone, verify reflected on engineer dashboard
```

### 3.3 Failover Procedures

**Scenario:** 5GHz band drops

1. Router automatically bands steers devices to 2.4GHz ("StageLink-Backup")
2. Performer phones reconnect automatically (no manual action needed)
3. Latency will increase (~30-50ms) but system remains functional
4. Engineer receives network status alert on dashboard

**Scenario:** Engineer laptop loses connection

1. Performer devices continue to maintain their mix state
2. Audio continues flowing from mixer through OSC/MIDI
3. Engineer laptop can re-connect and re-sync mix state
4. No interruption to performers

**Scenario:** Mixer console loses network connection

1. Audio on stage stops immediately
2. Engineer dashboard shows "Mixer Offline" alert
3. Fallback: Disconnect all performer phones, restart mixer network connection, reconnect phones

---

## Phase 4: Rollout Strategy

### Week 1-2: Local Testing
- Test with mock adapter in controlled environment
- Verify OSC/MIDI communication with StudioLive

### Week 3-4: Rehearsal Deployment
- Deploy to real stage with full band
- Run through full setlist
- Test failover scenarios
- Record latency metrics

### Week 5+: Live Performance
- Deploy with continuous monitoring
- Keep backup plan (fallback to wired monitors or previous system)
- Collect performance data for optimization

---

## Monitoring & Metrics

### Key Metrics to Track

```yaml
server_metrics:
  - audio_channel_update_frequency  # Should be 50-200 Hz
  - mix_state_sync_latency          # Should be < 10ms
  - websocket_message_latency       # Should be < 5ms

network_metrics:
  - round_trip_latency              # Target: < 20ms
  - jitter                          # Target: < 5ms
  - packet_loss_rate                # Target: < 0.1%
  - available_bandwidth             # Should be > 1 Mbps per device

device_metrics:
  - cpu_usage                       # Should be < 20% at idle
  - memory_usage                    # Should be < 100MB
  - battery_drain_rate              # Should be acceptable for 2-3 hr performance
```

---

## References & Tools

- **OSC Library:** https://github.com/colinbdclark/osc.js
- **MIDI Library:** https://github.com/justinlatimer/node-midi
- **PreSonus StudioLive Manual:** https://www.presonus.com/products/StudioLive (check OSC/MIDI docs)
- **Network Monitoring:** iperf, mtr, Ubiquiti UnifiController
- **QoS Tools:** TC (traffic control), wondershaper, NetLimiter

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 0.1 | Initial | Simulated mock inputs, wired testing only |
| 1.0 | TBD | Hardware abstraction layer, OSC/MIDI support, production network setup |


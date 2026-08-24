const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Import driver manager & tracking engine dependencies
const MixerManager = require('./drivers/mixer-manager');
const TrackingEngine = require('./tracking-engine');
const ManualProvider = require('./manual-provider');
const UWBProvider = require('./tracking/uwb-provider');

// Initialize Express application
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Active Hardware Mixer Driver
const activeMixer = new MixerManager({ type: process.env.MIXER_TYPE || 'x32', ip: '192.168.1.100' });
activeMixer.connect();

// Initialize Stage Intelligence Spatial Engine & Tracking Providers
const trackingEngine = new TrackingEngine();
const manualProvider = new ManualProvider();
const uwbProvider = new UWBProvider({ port: 8080, stageWidth: 20, stageHeight: 15 });

// Map UWB Hardware Tags to Musician IDs
uwbProvider.mapTagToMusician('TAG_01', 1); // Drummer
uwbProvider.mapTagToMusician('TAG_02', 2); // Bassist
uwbProvider.mapTagToMusician('TAG_03', 3); // Vocalist

// Register Providers
trackingEngine.registerProvider('MANUAL', manualProvider);
trackingEngine.registerProvider('UWB', uwbProvider);

// Set Active Provider from environment (default: MANUAL)
const activeProvider = process.env.TRACKING_MODE || 'MANUAL';
trackingEngine.setProvider(activeProvider);

if (activeProvider === 'UWB') {
  uwbProvider.start();
}

// Mock data: Musicians with Mix & Stage Intelligence Coordinates
const musicians = [
  {
    id: 1,
    name: 'Drummer',
    instrument: 'drums',
    mix: { volume: 0.8, pan: 0, mute: false, solo: false },
    stagePosition: { x: 50, y: 20, zone: 'Center Stage', status: 'GREEN' }
  },
  {
    id: 2,
    name: 'Bassist',
    instrument: 'bass',
    mix: { volume: 0.75, pan: -0.3, mute: false, solo: false },
    stagePosition: { x: 20, y: 50, zone: 'Stage Left', status: 'GREEN' }
  },
  {
    id: 3,
    name: 'Vocalist',
    instrument: 'vocals',
    mix: { volume: 0.9, pan: 0.2, mute: false, solo: false },
    stagePosition: { x: 80, y: 50, zone: 'Stage Right', status: 'GREEN' }
  }
];

// Mock data: 16 simulated audio input channels
const audioChannels = [
  { id: 1, name: 'kick', level: 0.7, muted: false },
  { id: 2, name: 'snare', level: 0.6, muted: false },
  { id: 3, name: 'hi-hat', level: 0.5, muted: false },
  { id: 4, name: 'tom-1', level: 0.4, muted: false },
  { id: 5, name: 'tom-2', level: 0.4, muted: false },
  { id: 6, name: 'tom-3', level: 0.4, muted: false },
  { id: 7, name: 'bass', level: 0.75, muted: false },
  { id: 8, name: 'click track', level: 0.3, muted: false },
  { id: 9, name: 'vocals-lead', level: 0.9, muted: false },
  { id: 10, name: 'vocals-harmony', level: 0.7, muted: false },
  { id: 11, name: 'guitar', level: 0.65, muted: false },
  { id: 12, name: 'keyboard', level: 0.6, muted: false },
  { id: 13, name: 'percussion', level: 0.5, muted: false },
  { id: 14, name: 'backing track', level: 0.8, muted: false },
  { id: 15, name: 'metronome', level: 0.4, muted: false },
  { id: 16, name: 'ambient', level: 0.3, muted: false }
];

// Core Spatial Logic: Evaluate Stage Zone based on X/Y Coordinates
function evaluateStageZone(x, y) {
  if (x < 30) return { zone: 'Stage Left', status: 'GREEN' };
  if (x > 70) return { zone: 'Stage Right', status: 'GREEN' };
  if (y > 85) return { zone: 'Off Stage', status: 'BLUE' };
  return { zone: 'Center Stage', status: 'GREEN' };
}

// Relay normalized telemetry from TrackingEngine to hardware & connected clients
trackingEngine.on('POSITION_UPDATE', (payload) => {
  const musician = musicians.find(m => m.id === payload.musicianId);
  if (musician) {
    const zoneInfo = evaluateStageZone(payload.coordinates.x, payload.coordinates.y);
    
    // Compute spatial stereo pan from horizontal X stage coordinate (-1.0 Left to +1.0 Right)
    const computedPan = payload.calculatedPan !== undefined 
      ? payload.calculatedPan 
      : parseFloat(((payload.coordinates.x - 50) / 50).toFixed(2));

    musician.stagePosition = {
      x: payload.coordinates.x,
      y: payload.coordinates.y,
      zone: zoneInfo.zone,
      status: zoneInfo.status
    };

    // Update in-memory mix state
    if (musician.mix) {
      musician.mix.pan = computedPan;
    }

    // 1. Send spatial pan update directly to physical mixer hardware bus/aux
    if (activeMixer && typeof activeMixer.updateSpatialPan === 'function') {
      activeMixer.updateSpatialPan(musician.id, musician.id, computedPan);
    }

    // 2. Broadcast Stage Intelligence telemetry to Engineer Dashboard
    io.emit('STAGE_INTELLIGENCE_UPDATE', {
      musicianId: musician.id,
      stagePosition: musician.stagePosition,
      accuracy: payload.accuracyMeters,
      provider: payload.providerType
    });

    // 3. Broadcast updated mix pan to Musician Mobile Client in real time
    io.emit('mix_updated', {
      musicianId: musician.id,
      mix: musician.mix,
      musicians
    });
  }
});

// REST Endpoints
app.get('/api/state', (req, res) => {
  res.json({ musicians, audioChannels, trackingProvider: trackingEngine.activeProviderKey });
});

app.post('/api/musicians', (req, res) => {
  const { name, instrument } = req.body;
  if (!name || !instrument) {
    return res.status(400).json({ error: 'Missing required fields: name and instrument' });
  }

  const newMusician = {
    id: musicians.length > 0 ? Math.max(...musicians.map(m => m.id)) + 1 : 1,
    name,
    instrument,
    mix: { volume: 0.5, pan: 0, mute: false, solo: false },
    stagePosition: { x: 50, y: 50, zone: 'Center Stage', status: 'GREEN' }
  };

  musicians.push(newMusician);
  io.emit('state_update', { musicians, audioChannels });
  res.status(201).json(newMusician);
});

// Socket.IO Real-time Pipeline
io.on('connection', (socket) => {
  console.log(`[Socket Connected] Client ID: ${socket.id}`);

  // Send initial state on connection
  socket.emit('initial_state', { 
    musicians, 
    audioChannels,
    trackingProvider: trackingEngine.activeProviderKey 
  });

  // Dynamic Provider Switching ('MANUAL' vs 'UWB')
  socket.on('SET_TRACKING_PROVIDER', (data) => {
    const { provider } = data;
    try {
      if (provider === 'UWB') {
        uwbProvider.start();
      } else if (provider === 'MANUAL') {
        uwbProvider.stop();
      }
      trackingEngine.setProvider(provider);
      io.emit('TRACKING_PROVIDER_CHANGED', { activeProvider: provider });
      console.log(`[TrackingEngine] Provider switched to: ${provider}`);
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // Listen for Stage Intelligence Position Drag/Telemetry Events
  socket.on('UPDATE_STAGE_POSITION', (data) => {
    const { musicianId, x, y } = data;
    manualProvider.updateManualPosition(musicianId, x, y);
  });

  // Listen for manual mix updates from front-end controls
  socket.on('update_mix', (data) => {
    const { musicianId, mixUpdate } = data;
    const musician = musicians.find(m => m.id === musicianId);
    if (musician) {
      musician.mix = { ...musician.mix, ...mixUpdate };

      // Send manual pan overrides directly to physical mixer hardware
      if (mixUpdate.pan !== undefined && activeMixer && typeof activeMixer.updateSpatialPan === 'function') {
        activeMixer.updateSpatialPan(musician.id, musician.id, mixUpdate.pan);
      }

      io.emit('mix_updated', { musicianId, mix: musician.mix, musicians });
    }
  });

  // Hardware Mixer Protocol Switching
  socket.on('set-mixer-type', (data) => {
    if (activeMixer && typeof activeMixer.switchDriver === 'function') {
      activeMixer.switchDriver(data.type, data.ip, data.port);
      console.log(`[Mixer Manager] Protocol switched to: ${data.type}`);
    }
  });

  socket.on('update_channel_level', (data) => {
    if (activeMixer) {
      activeMixer.updateChannel(data.channel, data.level);
    }
  });

  // Presets Management
  socket.on('save-preset', (data) => {
    const presetPath = path.join(__dirname, 'presets', `${data.name}.json`);
    if (!fs.existsSync(path.dirname(presetPath))) {
      fs.mkdirSync(path.dirname(presetPath), { recursive: true });
    }
    fs.writeFileSync(presetPath, JSON.stringify(data.currentLevels, null, 2));
    socket.emit('preset-saved', { success: true, name: data.name });
  });

  socket.on('load-preset', (data) => {
    const presetPath = path.join(__dirname, 'presets', `${data.name}.json`);
    if (fs.existsSync(presetPath)) {
      const presetData = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
      io.emit('apply-preset', presetData);
    } else {
      socket.emit('error', { message: 'Preset not found' });
    }
  });

  // Audio Streaming / Talkback
  socket.on('talkback-audio-chunk', (audioChunk) => {
    socket.broadcast.emit('incoming-talkback', audioChunk);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] Client ID: ${socket.id}`);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`StageLink Live server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Active Tracking Provider: ${trackingEngine.activeProviderKey}`);
});

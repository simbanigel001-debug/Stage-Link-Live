const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

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

// Mock data: Musicians with initial mix dictionaries
const musicians = [
  {
    id: 1,
    name: 'Drummer',
    instrument: 'drums',
    mix: {
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false
    }
  },
  {
    id: 2,
    name: 'Bassist',
    instrument: 'bass',
    mix: {
      volume: 0.75,
      pan: -0.3,
      mute: false,
      solo: false
    }
  },
  {
    id: 3,
    name: 'Vocalist',
    instrument: 'vocals',
    mix: {
      volume: 0.9,
      pan: 0.2,
      mute: false,
      solo: false
    }
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

// GET endpoint to retrieve current state
app.get('/api/state', (req, res) => {
  res.json({
    musicians,
    audioChannels
  });
});

// POST endpoint to add a new musician
app.post('/api/musicians', (req, res) => {
  const { name, instrument } = req.body;

  // Validate request
  if (!name || !instrument) {
    return res.status(400).json({
      error: 'Missing required fields: name and instrument'
    });
  }

  // Create new musician object
  const newMusician = {
    id: musicians.length > 0 ? Math.max(...musicians.map(m => m.id)) + 1 : 1,
    name,
    instrument,
    mix: {
      volume: 0.5,
      pan: 0,
      mute: false,
      solo: false
    }
  };

  // Add to musicians array
  musicians.push(newMusician);

  // Broadcast state update event to all connected clients
  io.emit('state_update', {
    musicians,
    audioChannels
  });

  // Return the new musician object
  res.status(201).json(newMusician);
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Send current state to newly connected client
  socket.emit('initial_state', {
    musicians,
    audioChannels
  });

  // Listen for mix update events
  socket.on('update_mix', (data) => {
    const { musicianId, mixUpdate } = data;

    // Find the musician and update their mix
    const musician = musicians.find(m => m.id === musicianId);
    if (musician) {
      musician.mix = {
        ...musician.mix,
        ...mixUpdate
      };

      // Broadcast the updated mix to all connected clients
      io.emit('mix_updated', {
        musicianId,
        mix: musician.mix,
        musicians
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`StageLink Live server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

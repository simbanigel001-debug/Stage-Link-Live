// test/test.js
// Simple integration test for StageLink Live v0.1
// - Verifies HTTP GET /api/state responds with 200 and JSON
// - Attempts to connect a mock Socket.IO client to the server

// Usage:
//   node test/test.js                 # attempts HTTP + socket.io test
//   SERVER_URL=http://localhost:3000 node test/test.js
// If socket.io-client is not installed, the script will print instructions.

const http = require('http');
const https = require('https');
const { URL } = require('url');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const TIMEOUT = 7000; // ms

function getJSON(path) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(path, SERVER_URL);
      const mod = u.protocol === 'https:' ? https : http;
      const opts = {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        timeout: TIMEOUT,
        headers: { 'Accept': 'application/json' }
      };
      const req = mod.request(opts, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          const status = res.statusCode;
          if (status >= 200 && status < 300) {
            try {
              const json = body ? JSON.parse(body) : null;
              resolve({ status, body: json });
            } catch (err) {
              reject(new Error('Invalid JSON response: ' + err.message));
            }
          } else {
            reject(new Error('HTTP status ' + status + ' returned'));
          }
        });
      });
      req.on('error', (err) => reject(err));
      req.on('timeout', () => { req.destroy(new Error('Request timed out')); });
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function testApiState() {
  console.log(`Testing HTTP GET ${SERVER_URL}/api/state ...`);
  try {
    const res = await getJSON('/api/state');
    console.log(`✓ /api/state responded ${res.status}`);
    console.log('  Response sample:', Array.isArray(res.body) ? `Array(${res.body.length})` : typeof res.body);
    return true;
  } catch (err) {
    console.error('✗ Failed to GET /api/state:', err.message);
    return false;
  }
}

function tryRequireSocketIoClient() {
  try {
    // socket.io@4 exposes `io` on require('socket.io-client')
    const client = require('socket.io-client');
    // support CommonJS default or named export
    const io = client.io || client;
    return io;
  } catch (err) {
    return null;
  }
}

async function testSocketIo() {
  console.log(`Testing Socket.IO connection to ${SERVER_URL} ...`);
  const io = tryRequireSocketIoClient();
  if (!io) {
    console.warn('socket.io-client not installed. Install it to run socket tests:');
    console.warn('  npm install --save-dev socket.io-client');
    return false;
  }

  return new Promise((resolve) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        console.error('✗ Socket.IO test timed out');
        try { socket && socket.close(); } catch (e) {}
        resolve(false);
      }
    }, TIMEOUT);

    // connect with short timeouts / few reconnection attempts
    const socket = io(SERVER_URL, {
      reconnectionAttempts: 2,
      timeout: 5000,
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('✓ Socket.IO: connected (id=' + socket.id + ')');
      // Optionally emit a ping event and wait for acknowledgement
      let ackHandled = false;
      try {
        socket.timeout(2000).emit('integration:test', { msg: 'hello' }, (err, resp) => {
          if (err) {
            console.log('  note: no acknowledgement for integration:test (this is fine)');
          } else {
            console.log('  ack received for integration:test:', resp);
          }
        });
      } catch (e) {
        // ignore emit errors
      }

      // close soon after successful connection
      setTimeout(() => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          socket.close();
          console.log('✓ Socket.IO: disconnected cleanly');
          resolve(true);
        }
      }, 800);
    });

    socket.on('connect_error', (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        console.error('✗ Socket.IO: connect_error:', err.message || err);
        try { socket.close(); } catch (e) {}
        resolve(false);
      }
    });

    socket.on('connect_timeout', () => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        console.error('✗ Socket.IO: connect_timeout');
        try { socket.close(); } catch (e) {}
        resolve(false);
      }
    });

    socket.on('error', (err) => {
      console.error('Socket.IO error event:', err && err.message ? err.message : err);
    });
  });
}

(async function main(){
  console.log('StageLink Live integration test');
  console.log('Server URL:', SERVER_URL);

  const apiOk = await testApiState();
  const socketOk = await testSocketIo();

  if (apiOk && socketOk) {
    console.log('\nAll checks passed ✓');
    process.exit(0);
  } else {
    console.error('\nOne or more checks failed');
    process.exit(2);
  }
})();

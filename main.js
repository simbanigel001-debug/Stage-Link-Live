const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const log = require('electron-log');

// Setup local logging file in user data path
log.transports.file.level = 'info';
log.info('Starting StageLink Live Host Application...');

// Start the existing Express & Socket.io server
let server;
try {
  server = require('./server.js');
} catch (err) {
  log.error('Failed to boot local StageLink server engine:', err);
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'StageLink Live - Console Host',
    backgroundColor: '#0b0f14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load local engineer dashboard
  mainWindow.loadURL('http://localhost:3000');

  // Handle external links safely in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

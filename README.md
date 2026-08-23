# StageLink Live — Local Startup (v0.1)

This document describes how to run StageLink Live v0.1 locally on your laptop for testing and development. It covers installing dependencies, starting the server, and how the engineer and musicians can connect (including scanning QR codes from the engineer dashboard).

## Prerequisites

- Node.js (v14+ recommended) and npm installed
- A laptop and one or more mobile devices (phones/tablets) on the same local network (Wi‑Fi)
- Optional: Git to clone the repository

## Install

Open a terminal in the project root (where package.json lives) and run:

```bash
# clone if you haven't already
git clone https://github.com/simbanigel001-debug/Stage-Link-Live.git
cd Stage-Link-Live

# install dependencies
npm install
```

If the project does not include a package.json or has custom setup, follow the repository README or inspect package.json for additional instructions.

## Start the server

If there is a start script defined in package.json, use:

```bash
npm start
```

If not, or to run directly with Node, run:

```bash
node server.js
```

Notes:
- By default the server listens on port 3000. If your environment uses a different port, check `server.js` or set the `PORT` environment variable:

```bash
# macOS / Linux
PORT=3000 npm start

# Windows (PowerShell)
$env:PORT = 3000; npm start
```

- If you get an `EADDRINUSE` error, port 3000 is already in use — either stop the process using it or choose another port.

## Accessing the Engineer Dashboard (Laptop)

1. Open a browser on your laptop and go to:

   http://localhost:3000

   You should see the "StageLink Live Core - Engineer Dashboard" page.

2. Use the dashboard to create musicians or view the active musician list. Each musician card shows a QR code that encodes a musician link in the format:

   http://<server-address>/musician.html?id=<musicianId>

   (On the updated dashboard this link will render as a QR code and as a text link on the card.)

## How Musicians (Mobile Phones) Connect via Local Wi‑Fi

To test wired earphone monitoring using mobile devices, make sure the phone is on the same Wi‑Fi network as the laptop running the StageLink server.

1. Find your laptop's local IP address on the Wi‑Fi network:

   - macOS / Linux: run `ifconfig` or `ip addr` and look for the `inet` address on the Wi‑Fi interface (often `en0`, `wlan0` or similar).
   - Windows: run `ipconfig` and look for the IPv4 address on the Wi‑Fi adapter (e.g., `192.168.1.42`).

2. On the mobile device, open the camera app or a QR scanner app and scan the QR code displayed on the engineer dashboard for the specific musician. The QR encodes a URL like:

   http://192.168.1.42:3000/musician.html?id=<musicianId>

   (Replace `192.168.1.42` with your laptop's IP.)

3. The phone should open the musician page in the browser. From there you can simulate/verify the musician view and wired earphone monitoring behavior.

Notes and troubleshooting:
- If the phone opens the link but the page cannot reach the server, check:
  - Laptop firewall rules — allow inbound connections for Node or on port 3000.
  - Confirm both devices are on the same subnet (e.g., both 192.168.1.x).
  - Try accessing the URL from another device on the network or `curl http://<laptop-ip>:3000` from another machine.

- If the QR codes do not render on the dashboard, ensure qrcode.js is available. The engineer dashboard includes qrcode.min.js via CDN (jsdelivr). If the CDN is blocked, enable outbound HTTP to jsdelivr or replace with a local copy of the library (download `qrcode.min.js` into `public/vendor/` and reference it in `public/index.html`).

## Alternative: Expose Local Server for Remote Devices

If testing remotely (devices not on the same Wi‑Fi), use a tunneling service like ngrok:

```bash
# install ngrok and run
ngrok http 3000
```

ngrok will give you a public URL (https://...). Use that URL in the QR codes or open it on the mobile device. Be careful exposing local development servers publicly — only use for testing.

## Development Tips

- Edit frontend files under `public/` (for example `public/index.html`) and refresh the browser to see changes.
- Backend code (server) is in `server.js` (or another entry point) — restart the server after changes, or use `nodemon` for auto-reload during development:

```bash
npm install -g nodemon
nodemon server.js
```

## Example Quick Commands Summary

```bash
# install
npm install

# start
npm start          # if defined
# or
node server.js

# run with nodemon (auto restart during dev)
nodemon server.js

# test from phone after finding laptop IP (e.g. 192.168.1.42)
# scan QR or open http://192.168.1.42:3000/musician.html?id=<musicianId>
```

If you'd like, I can add this README.md to the repository, create a convenience npm script in package.json (if you want a `start` script standardized), or add an example `start-local.sh` script for macOS/Linux. Which would you prefer next?
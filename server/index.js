const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

function createApp() {
  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  return app;
}

function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const url = req.url;
    if (url === '/ws/terminal') {
      ws.send(JSON.stringify({ type: 'info', message: 'terminal connected' }));
    } else if (url === '/ws/capture') {
      ws.send(JSON.stringify({ type: 'info', message: 'capture connected' }));
    } else if (url === '/ws/guide') {
      ws.send(JSON.stringify({ type: 'info', message: 'guide connected' }));
    } else {
      ws.close(4000, 'Unknown endpoint');
    }
  });

  server.listen(PORT, () => {
    console.log(`WiFi Lab running at http://localhost:${PORT}`);
  });

  return { app, server, wss };
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };

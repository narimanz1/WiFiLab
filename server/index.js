const express = require('express');
const http = require('http');
const path = require('path');
const { execSync } = require('child_process');
const { WebSocketServer } = require('ws');
const { TerminalManager } = require('./terminal.js');
const { StepEngine } = require('./stepEngine.js');
const { SessionManager } = require('./sessionManager.js');
const stepsConfig = require('./steps.json');

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';

function createApp() {
  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  return app;
}

function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  const tm = new TerminalManager();
  const stepEngine = new StepEngine(stepsConfig);
  const sessionManager = new SessionManager();

  const guideClients = new Set();

  function broadcast(clients, data) {
    const msg = JSON.stringify(data);
    clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
  }

  function terminalClients() {
    const s = new Set();
    wss.clients.forEach(c => { if (c._endpoint === 'terminal' && c.readyState === 1) s.add(c); });
    return s;
  }

  function captureClients() {
    const s = new Set();
    wss.clients.forEach(c => { if (c._endpoint === 'capture' && c.readyState === 1) s.add(c); });
    return s;
  }

  // Send raw terminal data (NOT JSON-stringified) to preserve ANSI escape codes
  function broadcastRaw(clients, data) {
    clients.forEach(c => { if (c.readyState === 1) c.send(data); });
  }

  function setupTerminalCallbacks() {
    tm.onMainData((data) => {
      broadcastRaw(terminalClients(), data);
      stepEngine.checkOutput('main', data);
      sessionManager.activity();
    });

    tm.onCaptureData((data) => {
      broadcastRaw(captureClients(), data);
      stepEngine.checkOutput('capture', data);
      sessionManager.activity();
    });
  }

  tm.createMain();
  setupTerminalCallbacks();

  stepEngine.on('step_change', (data) => {
    broadcast(guideClients, { type: 'step', ...data });
    if (data.step.show_capture) {
      const cmd = stepEngine.getCaptureCommand();
      if (cmd && !tm.capture) {
        tm.createCapture(cmd);
        setupCaptureCallback();
      }
    } else if (tm.capture) {
      tm.destroyCapture();
    }
  });

  stepEngine.on('step_validated', (data) => {
    broadcast(guideClients, { type: 'step_validated', ...data });
    setTimeout(() => stepEngine.advance(), 500);
  });

  stepEngine.on('completed', (data) => {
    sessionManager.stop();
    sessionManager.logSession({
      completed: true,
      duration_sec: data.stats.durationSec,
      steps_reached: data.stats.stepsCompleted,
      hints_used: data.stats.hintsUsed,
    });
    broadcast(guideClients, { type: 'completed', ...data });
    tm.destroyCapture();
  });

  function setupCaptureCallback() {
    tm.onCaptureData((data) => {
      broadcastRaw(captureClients(), data);
      stepEngine.checkOutput('capture', data);
      sessionManager.activity();
    });
  }

  sessionManager.on('warning', (data) => {
    broadcast(guideClients, { type: 'inactivity_warning', remainingSec: data.remainingSec });
  });

  sessionManager.on('timeout', () => {
    const stats = stepEngine.getStats();
    sessionManager.logSession({
      completed: false,
      duration_sec: stats.durationSec,
      steps_reached: stats.stepsCompleted,
      hints_used: stats.hintsUsed,
    });
    performReset();
  });

  function performReset() {
    stepEngine.reset();
    tm.destroyCapture();
    tm.destroyMain();
    try {
      execSync('bash scripts/reset.sh', { cwd: path.join(__dirname, '..'), timeout: 10000 });
    } catch (e) { /* ignore on non-Kali systems */ }
    tm.createMain();
    setupTerminalCallbacks();
    broadcast(guideClients, { type: 'reset' });
    sessionManager.start();
  }

  wss.on('connection', (ws, req) => {
    const url = req.url;

    if (url === '/ws/terminal') {
      ws._endpoint = 'terminal';
      ws.on('message', (msg) => {
        try {
          const parsed = JSON.parse(msg);
          if (parsed.type === 'input') {
            tm.writeMain(parsed.data);
            sessionManager.activity();
          } else if (parsed.type === 'resize') {
            tm.resizeMain(parsed.cols, parsed.rows);
          }
        } catch (e) {}
      });

    } else if (url === '/ws/capture') {
      ws._endpoint = 'capture';

    } else if (url === '/ws/guide') {
      ws._endpoint = 'guide';
      guideClients.add(ws);
      ws.on('close', () => guideClients.delete(ws));

      ws.on('message', (msg) => {
        try {
          const parsed = JSON.parse(msg);
          switch (parsed.type) {
            case 'start':
              stepEngine.reset();
              stepEngine.advance();
              sessionManager.start();
              break;
            case 'hint': {
              const hint = stepEngine.getNextHint();
              ws.send(JSON.stringify({ type: 'hint', text: hint }));
              sessionManager.activity();
              break;
            }
            case 'done':
              stepEngine.forceAdvance();
              setTimeout(() => stepEngine.advance(), 500);
              sessionManager.activity();
              break;
            case 'reset':
              performReset();
              break;
            case 'activity':
              sessionManager.activity();
              break;
            case 'sync': {
              const step = stepEngine.getCurrentStep();
              ws.send(JSON.stringify({
                type: 'step',
                step,
                index: stepEngine.currentStepIndex,
                total: stepEngine.steps.length,
                messages: step ? step.messages : [],
              }));
              break;
            }
          }
        } catch (e) {}
      });

      // Don't send initial step here — client sends 'sync' on connect which handles it
      // This prevents duplicate messages on first load

    } else {
      ws.close(4000, 'Unknown endpoint');
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`WiFi Lab running at http://${HOST}:${PORT}`);
  });

  return { app, server, wss, tm, stepEngine, sessionManager };
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };

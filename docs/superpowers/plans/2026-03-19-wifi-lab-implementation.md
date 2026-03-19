# WiFi Lab Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-based interactive WiFi penetration testing lab with a chat-style mentor guide and dual-terminal interface for a conference booth demo.

**Architecture:** Node.js + Express backend serves a single-page app. Two node-pty instances provide real terminal access (main shell + capture monitor). A Step Engine validates terminal output against regex patterns and drives the chat-style guide through 8 attack steps. Session Manager handles auto-reset, timeouts, and logging.

**Tech Stack:** Node.js, Express, ws (WebSocket), node-pty, xterm.js, vanilla HTML/CSS/JS

**Spec:** `docs/superpowers/specs/2026-03-19-wifi-lab-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Project config, dependencies |
| `server/index.js` | Express server, WebSocket upgrade, route wiring |
| `server/terminal.js` | node-pty lifecycle for main terminal + capture monitor |
| `server/stepEngine.js` | Step state machine, output validation, hint progression |
| `server/sessionManager.js` | Inactivity timer, reset/cleanup, session logging |
| `server/steps.json` | All 8 attack steps with messages, hints, validation patterns |
| `server/wordlist.txt` | Dictionary file for aircrack-ng (~1000 words) |
| `public/index.html` | Page structure: guide panel + terminal area |
| `public/css/style.css` | Matrix/hacker theme, layout, animations |
| `public/js/app.js` | App init, WebSocket connection, module coordination |
| `public/js/terminal.js` | xterm.js instances (main + capture), WebSocket bridge |
| `public/js/guide.js` | Chat message rendering, hint buttons, progress bar |
| `public/js/completion.js` | Completion screen: stats, matrix rain animation, QR code |
| `scripts/setup.sh` | Kali dependency installation |
| `scripts/reset.sh` | Network interface cleanup |
| `tests/stepEngine.test.js` | Step engine unit tests |
| `tests/sessionManager.test.js` | Session manager unit tests |

---

## Chunk 1: Project Foundation + Server

### Task 1: Project Initialization

**Files:**
- Create: `package.json`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "wifi-lab",
  "version": "1.0.0",
  "description": "Interactive WiFi penetration testing lab for conference booth",
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js",
    "test": "jest --verbose"
  },
  "dependencies": {
    "express": "^4.18.2",
    "node-pty": "^1.0.0",
    "ws": "^8.16.0",
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Bundle vendor assets for offline use (no internet at booth)**

```bash
mkdir -p public/vendor
cp node_modules/xterm/css/xterm.css public/vendor/xterm.min.css
cp node_modules/xterm/lib/xterm.js public/vendor/xterm.min.js
cp node_modules/xterm-addon-fit/lib/xterm-addon-fit.js public/vendor/xterm-addon-fit.min.js
```

Also download JetBrains Mono font files to `public/vendor/fonts/` and create a `@font-face` CSS file. Alternatively, rely on the fallback fonts (`'Fira Code', 'Courier New', monospace`).

- [ ] **Step 4: Update .gitignore**

Append to existing `.gitignore`:
```
node_modules/
server/sessions.log
*.cap
```

Note: `public/vendor/` is committed to git (needed for offline deployment).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore public/vendor/
git commit -m "feat: initialize project with express, node-pty, ws, xterm.js"
```

---

### Task 2: Express Server + WebSocket Foundation

**Files:**
- Create: `server/index.js`
- Test: `tests/server.test.js` (smoke test)

- [ ] **Step 1: Write server smoke test**

Create `tests/server.test.js`:

```js
const http = require('http');

describe('Server', () => {
  let serverProcess;

  // We test that the server module exports a createServer function
  // and that it can be started and stopped without errors
  test('index.js exports start function', () => {
    const { createApp } = require('../server/index.js');
    expect(typeof createApp).toBe('function');
  });

  test('createApp returns express app with expected routes', () => {
    const { createApp } = require('../server/index.js');
    const app = createApp();
    // Express app should have a listener for static files
    expect(app).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/server.test.js --verbose`
Expected: FAIL — `Cannot find module '../server/index.js'`

- [ ] **Step 3: Write server/index.js**

Create `server/index.js`:

```js
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

function createApp() {
  const app = express();

  // Serve static files from public/
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}

function startServer() {
  const app = createApp();
  const server = http.createServer(app);

  // WebSocket server — attached to HTTP server
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const url = req.url;

    if (url === '/ws/terminal') {
      // Main terminal WebSocket — handled in Task 3
      ws.send(JSON.stringify({ type: 'info', message: 'terminal connected' }));
    } else if (url === '/ws/capture') {
      // Capture monitor WebSocket — handled in Task 3
      ws.send(JSON.stringify({ type: 'info', message: 'capture connected' }));
    } else if (url === '/ws/guide') {
      // Guide WebSocket — handled in Task 7
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

// Run if executed directly
if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/server.test.js --verbose`
Expected: PASS

- [ ] **Step 5: Verify server starts manually**

Run: `node server/index.js &` then `curl http://localhost:3000/api/health`
Expected: `{"status":"ok"}`
Kill the server after verifying.

- [ ] **Step 6: Commit**

```bash
git add server/index.js tests/server.test.js
git commit -m "feat: add Express server with WebSocket endpoints"
```

---

### Task 3: Terminal Manager (node-pty)

**Files:**
- Create: `server/terminal.js`
- Test: `tests/terminal.test.js`

The terminal manager handles two independent node-pty instances: the main interactive shell and the capture monitor (read-only, managed by step engine).

- [ ] **Step 1: Write terminal manager tests**

Create `tests/terminal.test.js`:

```js
const { TerminalManager } = require('../server/terminal.js');

describe('TerminalManager', () => {
  let tm;

  afterEach(() => {
    if (tm) {
      tm.destroyAll();
      tm = null;
    }
  });

  test('creates main terminal', () => {
    tm = new TerminalManager();
    tm.createMain();
    expect(tm.main).toBeDefined();
    expect(tm.main.pid).toBeGreaterThan(0);
  });

  test('creates capture terminal', () => {
    tm = new TerminalManager();
    tm.createCapture('echo test');
    expect(tm.capture).toBeDefined();
    expect(tm.capture.pid).toBeGreaterThan(0);
  });

  test('destroyCapture kills capture terminal', () => {
    tm = new TerminalManager();
    tm.createCapture('sleep 999');
    expect(tm.capture).toBeDefined();
    tm.destroyCapture();
    expect(tm.capture).toBeNull();
  });

  test('destroyAll kills both terminals', () => {
    tm = new TerminalManager();
    tm.createMain();
    tm.createCapture('sleep 999');
    tm.destroyAll();
    expect(tm.main).toBeNull();
    expect(tm.capture).toBeNull();
  });

  test('onMainData callback receives output', (done) => {
    tm = new TerminalManager();
    tm.onMainData((data) => {
      // We should receive some output after creating terminal
      expect(typeof data).toBe('string');
      done();
    });
    tm.createMain();
    // Send a command to generate output
    tm.writeMain('echo hello\r');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/terminal.test.js --verbose`
Expected: FAIL — `Cannot find module '../server/terminal.js'`

- [ ] **Step 3: Write server/terminal.js**

```js
const pty = require('node-pty');
const os = require('os');

class TerminalManager {
  constructor() {
    this.main = null;
    this.capture = null;
    this._mainDataCallbacks = [];
    this._captureDataCallbacks = [];
  }

  createMain() {
    if (this.main) this.destroyMain();

    const shell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash';
    this.main = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 160,
      rows: 40,
      cwd: process.env.HOME || '/root',
    });

    this.main.onData((data) => {
      this._mainDataCallbacks.forEach(cb => cb(data));
    });

    return this.main;
  }

  createCapture(command) {
    if (this.capture) this.destroyCapture();

    const shell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash';
    const args = os.platform() === 'win32' ? ['/c', command] : ['-c', command];

    this.capture = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 160,
      rows: 15,
      cwd: os.tmpdir(),
    });

    this.capture.onData((data) => {
      this._captureDataCallbacks.forEach(cb => cb(data));
    });

    return this.capture;
  }

  writeMain(data) {
    if (this.main) this.main.write(data);
  }

  resizeMain(cols, rows) {
    if (this.main) this.main.resize(cols, rows);
  }

  resizeCapture(cols, rows) {
    if (this.capture) this.capture.resize(cols, rows);
  }

  onMainData(callback) {
    this._mainDataCallbacks.push(callback);
  }

  onCaptureData(callback) {
    this._captureDataCallbacks.push(callback);
  }

  destroyMain() {
    if (this.main) {
      try { this.main.kill(); } catch (e) { /* already dead */ }
      this.main = null;
    }
    this._mainDataCallbacks = [];
  }

  destroyCapture() {
    if (this.capture) {
      try { this.capture.kill(); } catch (e) { /* already dead */ }
      this.capture = null;
    }
    this._captureDataCallbacks = [];
  }

  destroyAll() {
    this.destroyMain();
    this.destroyCapture();
    this._mainDataCallbacks = [];
    this._captureDataCallbacks = [];
  }
}

module.exports = { TerminalManager };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/terminal.test.js --verbose`
Expected: PASS (all 5 tests). Note: on Windows the tests will use `cmd.exe`, on Kali they'll use `/bin/bash`.

- [ ] **Step 5: Commit**

```bash
git add server/terminal.js tests/terminal.test.js
git commit -m "feat: add TerminalManager with dual PTY support"
```

---

### Task 4: Wire Terminal WebSockets into Server

**Files:**
- Modify: `server/index.js`

Connect the TerminalManager to the WebSocket endpoints so data flows: browser ↔ WebSocket ↔ node-pty.

- [ ] **Step 1: Update server/index.js WebSocket handling**

Replace the `wss.on('connection', ...)` block in `server/index.js`:

```js
const { TerminalManager } = require('./terminal.js');

// Inside startServer(), after creating wss:
const tm = new TerminalManager();
tm.createMain();

tm.onMainData((data) => {
  // Broadcast main terminal output to all /ws/terminal clients
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client._endpoint === 'terminal') {
      client.send(data);
    }
  });
});

tm.onCaptureData((data) => {
  // Broadcast capture output to all /ws/capture clients
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client._endpoint === 'capture') {
      client.send(data);
    }
  });
});

wss.on('connection', (ws, req) => {
  const url = req.url;

  if (url === '/ws/terminal') {
    ws._endpoint = 'terminal';
    // Browser → terminal: forward keystrokes
    ws.on('message', (msg) => {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'input') {
        tm.writeMain(parsed.data);
      } else if (parsed.type === 'resize') {
        tm.resizeMain(parsed.cols, parsed.rows);
      }
    });
  } else if (url === '/ws/capture') {
    ws._endpoint = 'capture';
    // Capture monitor is read-only — no input from browser
  } else if (url === '/ws/guide') {
    ws._endpoint = 'guide';
    // Guide WebSocket — handled in Task 7
    ws.send(JSON.stringify({ type: 'info', message: 'guide connected' }));
  } else {
    ws.close(4000, 'Unknown endpoint');
  }
});

// Expose tm for step engine to use later
return { app, server, wss, tm };
```

- [ ] **Step 2: Verify server still starts**

Run: `node server/index.js &` → verify no errors → kill.

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: wire terminal manager into WebSocket endpoints"
```

---

## Chunk 2: Frontend Foundation

### Task 5: HTML Structure + Matrix CSS

**Files:**
- Create: `public/index.html`
- Create: `public/css/style.css`

- [ ] **Step 1: Create public/index.html**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WiFi Lab — Почувствуй себя хакером</title>
  <link rel="stylesheet" href="css/style.css">
  <link rel="stylesheet" href="vendor/xterm.min.css">
</head>
<body>
  <!-- Welcome Screen -->
  <div id="welcome-screen" class="screen active">
    <div class="welcome-content">
      <h1 class="glow">WiFi Lab</h1>
      <p class="welcome-subtitle">Интерактивная лаборатория по пентесту WiFi</p>
      <p class="welcome-description">Пройди пошаговый сценарий взлома WiFi сети.<br>Используй реальные инструменты. Почувствуй себя хакером.</p>
      <button id="btn-start" class="btn-primary">Начать &gt;&gt;</button>
    </div>
  </div>

  <!-- Main Lab Screen -->
  <div id="lab-screen" class="screen">
    <div class="lab-header">
      <span class="lab-title glow">WiFi_Lab://</span>
      <span id="session-timer" class="lab-timer">00:00</span>
      <button id="btn-reset" class="btn-reset" title="Сбросить сессию">↺ Сброс</button>
    </div>

    <div class="lab-container">
      <!-- Guide Panel (40%) -->
      <div class="guide-panel" id="guide-panel">
        <div class="guide-messages" id="guide-messages">
          <!-- Messages injected by guide.js -->
        </div>
        <div class="guide-controls">
          <div class="guide-buttons">
            <button id="btn-hint" class="btn-hint">💡 Подсказка</button>
            <button id="btn-done" class="btn-done">✅ Готово</button>
          </div>
          <div class="guide-progress">
            <span id="step-label">Шаг 1/8</span>
            <div class="progress-bar">
              <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Terminal Panel (60%) -->
      <div class="terminal-panel">
        <div class="terminal-main" id="terminal-main">
          <!-- xterm.js main terminal -->
        </div>
        <div class="terminal-capture hidden" id="terminal-capture-wrapper">
          <div class="capture-header">📡 Capture Monitor</div>
          <div id="terminal-capture">
            <!-- xterm.js capture terminal -->
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Completion Screen -->
  <div id="completion-screen" class="screen">
    <canvas id="matrix-rain"></canvas>
    <div class="completion-content">
      <h1 class="glow">ПАРОЛЬ НАЙДЕН!</h1>
      <div id="found-password" class="found-password"></div>
      <div id="completion-stats" class="completion-stats">
        <!-- Stats injected by completion.js -->
      </div>
      <div id="qr-code" class="qr-code"></div>
      <button id="btn-restart" class="btn-primary">Начать заново</button>
    </div>
  </div>

  <!-- Inactivity Warning -->
  <div id="inactivity-warning" class="inactivity-warning hidden">
    <p>Ты ещё здесь? Сессия сбросится через <span id="inactivity-countdown">60</span> сек...</p>
    <button id="btn-still-here" class="btn-primary">Я здесь!</button>
  </div>

  <script src="vendor/xterm.min.js"></script>
  <script src="vendor/xterm-addon-fit.min.js"></script>
  <script src="js/terminal.js"></script>
  <script src="js/guide.js"></script>
  <script src="js/completion.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create public/css/style.css**

```css
/* === Reset & Base === */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* Font: JetBrains Mono bundled in public/vendor/ for offline use.
   Fallback to system monospace if not available. */

:root {
  --bg-primary: #0a0f0a;
  --bg-guide: #0d140d;
  --bg-terminal: #000000;
  --text-primary: #33ff33;
  --text-secondary: #1a9c1a;
  --text-dim: #0e5c0e;
  --text-white: #e0e0e0;
  --border: #1a3a1a;
  --accent: #00ff41;
  --btn-primary-bg: #1a3a1a;
  --btn-primary-hover: #2a5a2a;
  --btn-hint-bg: #1a1a3a;
  --btn-hint-hover: #2a2a5a;
  --glow-color: #00ff41;
}

html, body {
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
  font-size: 14px;
}

/* === Glow Effect === */
.glow {
  text-shadow: 0 0 6px var(--glow-color), 0 0 12px var(--glow-color);
}

/* === Screens === */
.screen {
  display: none;
  position: absolute;
  inset: 0;
}
.screen.active {
  display: flex;
}

/* === Welcome Screen === */
#welcome-screen {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}
.welcome-content {
  text-align: center;
}
.welcome-content h1 {
  font-size: 48px;
  margin-bottom: 12px;
  letter-spacing: 4px;
}
.welcome-subtitle {
  font-size: 18px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.welcome-description {
  font-size: 14px;
  color: var(--text-dim);
  margin-bottom: 32px;
  line-height: 1.6;
}

/* === Buttons === */
.btn-primary {
  background: var(--btn-primary-bg);
  color: var(--text-primary);
  border: 1px solid var(--text-secondary);
  padding: 12px 32px;
  font-family: inherit;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-primary:hover {
  background: var(--btn-primary-hover);
  box-shadow: 0 0 12px var(--glow-color);
}
.btn-hint {
  background: var(--btn-hint-bg);
  color: #8888ff;
  border: 1px solid #333366;
  padding: 8px 16px;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-hint:hover {
  background: var(--btn-hint-hover);
}
.btn-done {
  background: var(--btn-primary-bg);
  color: var(--text-primary);
  border: 1px solid var(--text-secondary);
  padding: 8px 16px;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-done:hover {
  background: var(--btn-primary-hover);
}
.btn-reset {
  background: transparent;
  color: var(--text-dim);
  border: 1px solid var(--text-dim);
  padding: 4px 12px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-reset:hover {
  color: #ff4444;
  border-color: #ff4444;
}

/* === Lab Header === */
.lab-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-primary);
}
.lab-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
}
.lab-timer {
  color: var(--text-secondary);
  font-size: 14px;
  margin-left: auto;
}

/* === Lab Container === */
#lab-screen {
  flex-direction: column;
}
.lab-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* === Guide Panel === */
.guide-panel {
  width: 40%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: var(--bg-guide);
}
.guide-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.guide-msg {
  background: #152015;
  border-radius: 8px;
  padding: 12px;
  color: var(--text-white);
  font-size: 13px;
  line-height: 1.5;
  animation: fadeIn 0.3s ease-out;
}
.guide-msg b, .guide-msg code {
  color: var(--text-primary);
}
.guide-msg code {
  background: #0a120a;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}
.guide-msg.success {
  border-left: 3px solid var(--accent);
  background: #0a200a;
}
.guide-msg.hint {
  border-left: 3px solid #6666cc;
  background: #151530;
  color: #c0c0ff;
}
.guide-controls {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.guide-buttons {
  display: flex;
  gap: 8px;
}
.guide-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}
#step-label {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.progress-bar {
  flex: 1;
  height: 4px;
  background: #1a1a1a;
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--text-secondary), var(--accent));
  border-radius: 2px;
  transition: width 0.5s ease;
}

/* === Terminal Panel === */
.terminal-panel {
  width: 60%;
  display: flex;
  flex-direction: column;
  background: var(--bg-terminal);
}
.terminal-main {
  flex: 1;
  overflow: hidden;
}
.terminal-capture {
  border-top: 1px solid var(--border);
  height: 35%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.capture-header {
  padding: 4px 12px;
  font-size: 11px;
  color: var(--text-secondary);
  background: #0a0a0a;
  border-bottom: 1px solid var(--border);
}
#terminal-capture {
  flex: 1;
  overflow: hidden;
}

/* === Completion Screen === */
#completion-screen {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}
#matrix-rain {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.completion-content {
  position: relative;
  z-index: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.completion-content h1 {
  font-size: 36px;
}
.found-password {
  font-size: 24px;
  color: var(--accent);
  padding: 12px 24px;
  border: 2px solid var(--accent);
  border-radius: 8px;
  background: rgba(0, 255, 65, 0.05);
}
.completion-stats {
  display: flex;
  gap: 24px;
  color: var(--text-secondary);
  font-size: 14px;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.stat-value {
  font-size: 20px;
  color: var(--text-primary);
}
.stat-label {
  font-size: 11px;
  color: var(--text-dim);
}
.qr-code {
  margin-top: 8px;
}

/* === Inactivity Warning === */
.inactivity-warning {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #1a0a0a;
  border: 1px solid #ff4444;
  padding: 12px 24px;
  border-radius: 8px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 16px;
  color: #ff8888;
}

/* === Utilities === */
.hidden {
  display: none !important;
}

/* === Scrollbar === */
.guide-messages::-webkit-scrollbar {
  width: 6px;
}
.guide-messages::-webkit-scrollbar-track {
  background: transparent;
}
.guide-messages::-webkit-scrollbar-thumb {
  background: var(--text-dim);
  border-radius: 3px;
}

/* === Animations === */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 3: Verify page loads in browser**

Run: `node server/index.js` → open `http://localhost:3000`
Expected: Dark page with "WiFi Lab" title and "Начать >>" button visible.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/css/style.css
git commit -m "feat: add HTML structure and Matrix theme CSS"
```

---

### Task 6: Frontend Terminal (xterm.js)

**Files:**
- Create: `public/js/terminal.js`

- [ ] **Step 1: Create public/js/terminal.js**

```js
/**
 * Terminal module — manages xterm.js instances for main terminal and capture monitor.
 * Connects to backend via WebSocket.
 */
const WifiTerminal = (() => {
  let mainTerm = null;
  let captureTerm = null;
  let mainWs = null;
  let captureWs = null;
  let mainFitAddon = null;
  let captureFitAddon = null;

  const THEME = {
    background: '#000000',
    foreground: '#33ff33',
    cursor: '#33ff33',
    cursorAccent: '#000000',
    selectionBackground: '#1a3a1a',
    black: '#000000',
    red: '#ff5555',
    green: '#33ff33',
    yellow: '#ffff55',
    blue: '#5555ff',
    magenta: '#ff55ff',
    cyan: '#55ffff',
    white: '#e0e0e0',
    brightBlack: '#555555',
    brightRed: '#ff8888',
    brightGreen: '#55ff55',
    brightYellow: '#ffff88',
    brightBlue: '#8888ff',
    brightMagenta: '#ff88ff',
    brightCyan: '#88ffff',
    brightWhite: '#ffffff',
  };

  function createWebSocket(path) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return new WebSocket(`${protocol}//${location.host}${path}`);
  }

  function initMain(container) {
    mainTerm = new Terminal({
      theme: THEME,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 15,
      cursorBlink: true,
      scrollback: 1000,
    });
    mainFitAddon = new FitAddon.FitAddon();
    mainTerm.loadAddon(mainFitAddon);
    mainTerm.open(container);
    mainFitAddon.fit();

    mainWs = createWebSocket('/ws/terminal');

    mainWs.onopen = () => {
      // Send initial size
      mainWs.send(JSON.stringify({
        type: 'resize',
        cols: mainTerm.cols,
        rows: mainTerm.rows,
      }));
    };

    mainWs.onmessage = (event) => {
      mainTerm.write(event.data);
    };

    mainWs.onclose = () => {
      setTimeout(() => initMainWs(), 2000);
    };

    mainTerm.onData((data) => {
      if (mainWs && mainWs.readyState === WebSocket.OPEN) {
        mainWs.send(JSON.stringify({ type: 'input', data }));
      }
    });

    mainTerm.onResize(({ cols, rows }) => {
      if (mainWs && mainWs.readyState === WebSocket.OPEN) {
        mainWs.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    // Re-fit on window resize
    window.addEventListener('resize', () => {
      if (mainFitAddon) mainFitAddon.fit();
      if (captureFitAddon) captureFitAddon.fit();
    });
  }

  function initMainWs() {
    mainWs = createWebSocket('/ws/terminal');
    mainWs.onmessage = (event) => mainTerm.write(event.data);
    mainWs.onclose = () => setTimeout(() => initMainWs(), 2000);
    mainWs.onopen = () => {
      mainWs.send(JSON.stringify({
        type: 'resize',
        cols: mainTerm.cols,
        rows: mainTerm.rows,
      }));
    };
  }

  function initCapture(container) {
    captureTerm = new Terminal({
      theme: { ...THEME, foreground: '#1a9c1a' },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 500,
    });
    captureFitAddon = new FitAddon.FitAddon();
    captureTerm.loadAddon(captureFitAddon);
    captureTerm.open(container);
    captureFitAddon.fit();

    captureWs = createWebSocket('/ws/capture');
    captureWs.onmessage = (event) => {
      captureTerm.write(event.data);
    };
    captureWs.onclose = () => {
      setTimeout(() => initCaptureWs(), 2000);
    };
  }

  function initCaptureWs() {
    captureWs = createWebSocket('/ws/capture');
    captureWs.onmessage = (event) => captureTerm.write(event.data);
    captureWs.onclose = () => setTimeout(() => initCaptureWs(), 2000);
  }

  function showCapture() {
    const wrapper = document.getElementById('terminal-capture-wrapper');
    wrapper.classList.remove('hidden');
    if (captureFitAddon) setTimeout(() => captureFitAddon.fit(), 50);
    if (mainFitAddon) setTimeout(() => mainFitAddon.fit(), 50);
  }

  function hideCapture() {
    const wrapper = document.getElementById('terminal-capture-wrapper');
    wrapper.classList.add('hidden');
    if (mainFitAddon) setTimeout(() => mainFitAddon.fit(), 50);
  }

  function clearMain() {
    if (mainTerm) mainTerm.clear();
  }

  function clearCapture() {
    if (captureTerm) captureTerm.clear();
  }

  function focus() {
    if (mainTerm) mainTerm.focus();
  }

  return {
    initMain,
    initCapture,
    showCapture,
    hideCapture,
    clearMain,
    clearCapture,
    focus,
  };
})();
```

- [ ] **Step 2: Verify terminal renders in browser**

Run: `node server/index.js` → open `http://localhost:3000` → click "Начать"
Expected: Should see a black terminal on the right side (no shell yet until we wire up screens — that's in app.js).

- [ ] **Step 3: Commit**

```bash
git add public/js/terminal.js
git commit -m "feat: add xterm.js terminal module with dual instance support"
```

---

## Chunk 3: Step Engine + Guide

### Task 7: Steps Configuration

**Files:**
- Create: `server/steps.json`

- [ ] **Step 1: Create server/steps.json**

This file contains all 8 attack scenario steps with Russian text, hints, and validation patterns. The `target_bssid` and `target_channel` are placeholders to be updated for the actual router at the booth.

```json
{
  "target_bssid": "AA:BB:CC:DD:EE:FF",
  "target_ssid": "SOCOL_TARGET",
  "target_channel": "6",
  "wordlist_path": "/home/kali/WiFiLab/server/wordlist.txt",
  "capture_path": "/tmp/wifilab_capture",
  "steps": [
    {
      "id": "welcome",
      "order": 1,
      "title": "Добро пожаловать",
      "messages": [
        "Привет! Добро пожаловать в WiFi Lab 🔓",
        "Сегодня ты попробуешь себя в роли пентестера и взломаешь WiFi сеть.",
        "Роутер перед тобой — твоя цель. Все действия легальны и контролируемы.",
        "Готов? Нажми «Готово» чтобы начать!"
      ],
      "hints": [],
      "validation": {
        "type": "manual",
        "pattern": null,
        "timeout_sec": null
      },
      "on_success": null,
      "show_capture": false
    },
    {
      "id": "kill_processes",
      "order": 2,
      "title": "Убираем помехи",
      "messages": [
        "Перед началом нужно убить процессы, которые могут мешать работе WiFi-адаптера в режиме мониторинга.",
        "Используй команду <code>airmon-ng</code> с параметрами <code>check kill</code> для этого."
      ],
      "hints": [
        "Команда состоит из трёх слов: утилита + действие + подтверждение",
        "Полная команда: <code>sudo airmon-ng check kill</code>"
      ],
      "validation": {
        "type": "output_match",
        "pattern": "(Killing these processes|No interfering processes)",
        "timeout_sec": 120,
        "source": "main"
      },
      "on_success": "Отлично! Мешающие процессы убиты. Теперь WiFi-адаптер свободен.",
      "show_capture": false
    },
    {
      "id": "monitor_mode",
      "order": 3,
      "title": "Режим мониторинга",
      "messages": [
        "Теперь нужно перевести WiFi-адаптер в режим мониторинга. Это позволит перехватывать все пакеты в эфире.",
        "Используй <code>airmon-ng</code> с параметром <code>start</code> и именем интерфейса."
      ],
      "hints": [
        "Сначала посмотри доступные интерфейсы: <code>iwconfig</code> или <code>airmon-ng</code>",
        "Нужный интерфейс обычно называется <code>wlan0</code>",
        "Полная команда: <code>sudo airmon-ng start wlan0</code>"
      ],
      "validation": {
        "type": "output_match",
        "pattern": "(wlan\\d+mon|monitor mode)",
        "timeout_sec": 120,
        "source": "main"
      },
      "on_success": "Видишь интерфейс в режиме мониторинга? Теперь мы можем слушать эфир!",
      "show_capture": false
    },
    {
      "id": "scan_networks",
      "order": 4,
      "title": "Сканирование сетей",
      "messages": [
        "Запусти сканирование всех WiFi сетей вокруг. Нам нужно найти нашу цель.",
        "Используй <code>airodump-ng</code> с интерфейсом в режиме мониторинга.",
        "Когда увидишь нашу целевую сеть — нажми <code>Ctrl+C</code> чтобы остановить сканирование и нажми «Готово»."
      ],
      "hints": [
        "Интерфейс мониторинга обычно называется <code>wlan0mon</code>",
        "Полная команда: <code>sudo airodump-ng wlan0mon</code>",
        "Ищи сеть с именем <code>{target_ssid}</code>"
      ],
      "validation": {
        "type": "output_match",
        "pattern": "{target_bssid}",
        "timeout_sec": 180,
        "source": "main"
      },
      "on_success": "Нашли! Вижу целевую сеть. Запомни BSSID и канал — они нам понадобятся.",
      "show_capture": false
    },
    {
      "id": "target_capture",
      "order": 5,
      "title": "Прицельный захват",
      "messages": [
        "Сейчас я запущу прицельный захват пакетов целевой сети в отдельном окне внизу.",
        "Ты увидишь монитор захвата — он будет записывать всё что происходит в целевой сети.",
        "Переходи к следующему шагу — нажми «Готово»."
      ],
      "hints": [],
      "validation": {
        "type": "manual",
        "pattern": null,
        "timeout_sec": null
      },
      "on_success": "Монитор захвата запущен! Видишь окно внизу? Там airodump-ng записывает пакеты.",
      "show_capture": true,
      "capture_command": "sudo airodump-ng -c {target_channel} --bssid {target_bssid} -w {capture_path} wlan0mon"
    },
    {
      "id": "deauth",
      "order": 6,
      "title": "Деаутентификация",
      "messages": [
        "Теперь нужно заставить клиента переподключиться к роутеру, чтобы перехватить handshake.",
        "Для этого отправь пакеты деаутентификации с помощью <code>aireplay-ng</code>.",
        "Используй флаг <code>-0</code> (deauth), количество пакетов, <code>-a</code> (BSSID роутера) и интерфейс мониторинга."
      ],
      "hints": [
        "Флаг <code>-0 5</code> отправит 5 пакетов деаутентификации",
        "Флаг <code>-a</code> указывает BSSID целевого роутера",
        "Полная команда: <code>sudo aireplay-ng -0 5 -a {target_bssid} wlan0mon</code>"
      ],
      "validation": {
        "type": "output_match",
        "pattern": "(DeAuth|deauthentication|Sending 64 directed)",
        "timeout_sec": 120,
        "source": "main"
      },
      "on_success": "Деаутентификация отправлена! Смотри в монитор захвата — ждём handshake...",
      "show_capture": true
    },
    {
      "id": "handshake",
      "order": 7,
      "title": "Перехват рукопожатия",
      "messages": [
        "Смотри в монитор захвата внизу ↓",
        "Когда клиент переподключится, в правом верхнем углу окна airodump-ng появится надпись <code>WPA handshake</code>.",
        "Если не появилось — попробуй отправить деаутентификацию ещё раз (предыдущий шаг)."
      ],
      "hints": [
        "Подожди 10-15 секунд после деаутентификации",
        "Если handshake не появился — повтори: <code>sudo aireplay-ng -0 5 -a {target_bssid} wlan0mon</code>"
      ],
      "validation": {
        "type": "output_match",
        "pattern": "WPA handshake:\\s*{target_bssid}",
        "timeout_sec": 300,
        "source": "capture"
      },
      "on_success": "HANDSHAKE ПЕРЕХВАЧЕН! 🎉 Теперь у нас есть всё для взлома пароля!",
      "show_capture": true
    },
    {
      "id": "crack",
      "order": 8,
      "title": "Взлом пароля",
      "messages": [
        "Финальный шаг! Используй <code>aircrack-ng</code> чтобы подобрать пароль по словарю.",
        "Нужно указать файл захвата (<code>-cap</code> файл) и словарь (<code>-w</code> путь к словарю).",
        "Файл захвата: <code>{capture_path}-01.cap</code>",
        "Словарь: <code>{wordlist_path}</code>"
      ],
      "hints": [
        "Используй флаг <code>-w</code> для указания словаря и <code>-b</code> для BSSID",
        "Полная команда: <code>sudo aircrack-ng -w {wordlist_path} -b {target_bssid} {capture_path}-01.cap</code>"
      ],
      "validation": {
        "type": "output_match",
        "pattern": "KEY FOUND!",
        "timeout_sec": 120,
        "source": "main"
      },
      "on_success": null,
      "show_capture": false
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add server/steps.json
git commit -m "feat: add step configuration with all 8 attack scenario steps"
```

---

### Task 8: Step Engine Backend

**Files:**
- Create: `server/stepEngine.js`
- Test: `tests/stepEngine.test.js`

- [ ] **Step 1: Write step engine tests**

Create `tests/stepEngine.test.js`:

```js
const { StepEngine } = require('../server/stepEngine.js');

// Load steps config for testing
const stepsConfig = require('../server/steps.json');

describe('StepEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new StepEngine(stepsConfig);
  });

  test('initializes at step 0 (welcome)', () => {
    expect(engine.currentStepIndex).toBe(0);
    expect(engine.getCurrentStep().id).toBe('welcome');
  });

  test('getCurrentStep returns step object', () => {
    const step = engine.getCurrentStep();
    expect(step).toHaveProperty('id');
    expect(step).toHaveProperty('messages');
    expect(step).toHaveProperty('validation');
  });

  test('advance moves to next step', () => {
    engine.advance();
    expect(engine.currentStepIndex).toBe(1);
    expect(engine.getCurrentStep().id).toBe('kill_processes');
  });

  test('advance does not go past last step', () => {
    for (let i = 0; i < 20; i++) engine.advance();
    expect(engine.currentStepIndex).toBe(stepsConfig.steps.length - 1);
  });

  test('checkOutput matches validation pattern for monitor_mode step', () => {
    engine.currentStepIndex = 2; // monitor_mode
    const result = engine.checkOutput('main', 'Found interface wlan0mon in monitor mode');
    expect(result).toBe(true);
  });

  test('checkOutput returns false for non-matching output', () => {
    engine.currentStepIndex = 2; // monitor_mode
    const result = engine.checkOutput('main', 'some random output');
    expect(result).toBe(false);
  });

  test('checkOutput respects source (main vs capture)', () => {
    engine.currentStepIndex = 6; // handshake — expects capture source
    const resultWrongSource = engine.checkOutput('main', 'WPA handshake: AA:BB');
    expect(resultWrongSource).toBe(false);
    const resultRightSource = engine.checkOutput('capture', 'WPA handshake: AA:BB');
    expect(resultRightSource).toBe(true);
  });

  test('getHint returns progressive hints', () => {
    engine.currentStepIndex = 2; // monitor_mode has 3 hints
    expect(engine.getNextHint()).toContain('iwconfig');
    expect(engine.getNextHint()).toContain('wlan0');
    expect(engine.getNextHint()).toContain('sudo airmon-ng start wlan0');
    expect(engine.getNextHint()).toBeNull(); // no more hints
  });

  test('reset brings back to step 0', () => {
    engine.advance();
    engine.advance();
    engine.getNextHint();
    engine.reset();
    expect(engine.currentStepIndex).toBe(0);
    expect(engine.hintsUsed).toBe(0);
    expect(engine.currentHintIndex).toBe(0);
  });

  test('isComplete returns true on last step match', () => {
    engine.currentStepIndex = 7; // crack
    expect(engine.isComplete()).toBe(false);
    engine.checkOutput('main', 'KEY FOUND! [ password123 ]');
    expect(engine.isComplete()).toBe(true);
  });

  test('interpolates target_bssid in patterns', () => {
    engine.currentStepIndex = 3; // scan_networks — pattern has {target_bssid}
    const result = engine.checkOutput('main', `Found ${stepsConfig.target_bssid}`);
    expect(result).toBe(true);
  });

  test('getStats returns session statistics', () => {
    engine.advance();
    engine.getNextHint();
    engine.getNextHint();
    const stats = engine.getStats();
    expect(stats.hintsUsed).toBe(2);
    expect(stats.stepsCompleted).toBe(1);
    expect(stats.currentStep).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/stepEngine.test.js --verbose`
Expected: FAIL — `Cannot find module '../server/stepEngine.js'`

- [ ] **Step 3: Write server/stepEngine.js**

```js
const fs = require('fs');
const path = require('path');

class StepEngine {
  constructor(config) {
    this.config = config;
    this.steps = config.steps;
    this.currentStepIndex = 0;
    this.currentHintIndex = 0;
    this.hintsUsed = 0;
    this.startTime = Date.now();
    this._completed = false;
    this._listeners = [];
    this._outputBuffers = { main: '', capture: '' };
  }

  getCurrentStep() {
    return this.steps[this.currentStepIndex] || null;
  }

  advance() {
    if (this.currentStepIndex < this.steps.length - 1) {
      this.currentStepIndex++;
      this.currentHintIndex = 0;
      this._emit('step_change', {
        step: this.getCurrentStep(),
        index: this.currentStepIndex,
        total: this.steps.length,
      });
    }
  }

  checkOutput(source, data) {
    const step = this.getCurrentStep();
    if (!step || step.validation.type !== 'output_match') return false;

    const expectedSource = step.validation.source || 'main';
    if (source !== expectedSource) return false;

    // Buffer output to handle split PTY chunks
    this._outputBuffers[source] = (this._outputBuffers[source] || '') + data;
    if (this._outputBuffers[source].length > 4096) {
      this._outputBuffers[source] = this._outputBuffers[source].slice(-4096);
    }

    const pattern = this._interpolate(step.validation.pattern);
    const regex = new RegExp(pattern, 'i');
    const matched = regex.test(this._outputBuffers[source]);

    if (matched) {
      if (this.currentStepIndex === this.steps.length - 1) {
        // Extract password from KEY FOUND! output
        const pwdMatch = data.match(/KEY FOUND!\s*\[\s*(.+?)\s*\]/);
        this._completed = true;
        this._emit('completed', {
          password: pwdMatch ? pwdMatch[1] : 'unknown',
          stats: this.getStats(),
        });
      } else {
        this._emit('step_validated', {
          stepId: step.id,
          successMessage: this._interpolate(step.on_success),
        });
      }
    }

    return matched;
  }

  forceAdvance() {
    const step = this.getCurrentStep();
    if (step) {
      this._emit('step_validated', {
        stepId: step.id,
        successMessage: this._interpolate(step.on_success),
        forced: true,
      });
    }
  }

  getNextHint() {
    const step = this.getCurrentStep();
    if (!step || !step.hints || this.currentHintIndex >= step.hints.length) {
      return null;
    }
    const hint = this._interpolate(step.hints[this.currentHintIndex]);
    this.currentHintIndex++;
    this.hintsUsed++;
    return hint;
  }

  getCaptureCommand() {
    const step = this.getCurrentStep();
    if (step && step.capture_command) {
      return this._interpolate(step.capture_command);
    }
    return null;
  }

  shouldShowCapture() {
    const step = this.getCurrentStep();
    return step ? !!step.show_capture : false;
  }

  isComplete() {
    return this._completed;
  }

  reset() {
    this.currentStepIndex = 0;
    this.currentHintIndex = 0;
    this.hintsUsed = 0;
    this.startTime = Date.now();
    this._completed = false;
    this._outputBuffers = { main: '', capture: '' };
    this._emit('reset', {});
  }

  getStats() {
    return {
      hintsUsed: this.hintsUsed,
      stepsCompleted: this.currentStepIndex,
      currentStep: this.currentStepIndex,
      totalSteps: this.steps.length,
      durationSec: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  on(event, callback) {
    this._listeners.push({ event, callback });
  }

  _emit(event, data) {
    this._listeners
      .filter(l => l.event === event)
      .forEach(l => l.callback(data));
  }

  _interpolate(str) {
    if (!str) return str;
    return str
      .replace(/\{target_bssid\}/g, this.config.target_bssid)
      .replace(/\{target_ssid\}/g, this.config.target_ssid)
      .replace(/\{target_channel\}/g, this.config.target_channel)
      .replace(/\{wordlist_path\}/g, this.config.wordlist_path)
      .replace(/\{capture_path\}/g, this.config.capture_path);
  }
}

module.exports = { StepEngine };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/stepEngine.test.js --verbose`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/stepEngine.js tests/stepEngine.test.js
git commit -m "feat: add StepEngine with validation, hints, and interpolation"
```

---

### Task 9: Guide Panel Frontend

**Files:**
- Create: `public/js/guide.js`

- [ ] **Step 1: Create public/js/guide.js**

```js
/**
 * Guide module — renders chat-style mentor messages, handles hints and progress.
 */
const Guide = (() => {
  let guideWs = null;
  let onStepReady = null; // callback when step data arrives
  const _externalHandlers = []; // app-level message handlers

  function init(callbacks) {
    onStepReady = callbacks.onStepReady || null;
    connectWs();
  }

  function connectWs() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    guideWs = new WebSocket(`${protocol}//${location.host}/ws/guide`);

    guideWs.onopen = () => {
      // Request state sync on reconnect
      guideWs.send(JSON.stringify({ type: 'sync' }));
    };

    guideWs.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
      // Forward to external handlers (app.js)
      _externalHandlers.forEach(cb => cb(msg));
    };

    guideWs.onclose = () => {
      setTimeout(connectWs, 2000);
    };
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'step':
        renderStep(msg);
        break;
      case 'step_validated':
        renderSuccess(msg.successMessage);
        break;
      case 'hint':
        renderHint(msg.text);
        break;
      case 'completed':
        // Handled by app.js
        break;
      case 'sync':
        // Replay state on reconnect
        clearMessages();
        if (msg.messages) {
          msg.messages.forEach(m => addMessage(m.text, m.cssClass));
        }
        updateProgress(msg.currentStep, msg.totalSteps);
        break;
    }
  }

  function renderStep(stepData) {
    const container = document.getElementById('guide-messages');
    stepData.messages.forEach((text, i) => {
      setTimeout(() => {
        addMessage(text, 'guide-msg');
        container.scrollTop = container.scrollHeight;
      }, i * 400); // Stagger messages for chat effect
    });

    updateProgress(stepData.index, stepData.total);

    if (onStepReady) onStepReady(stepData);
  }

  function renderSuccess(text) {
    if (text) {
      addMessage(text, 'guide-msg success');
    }
    scrollToBottom();
  }

  function renderHint(text) {
    if (text) {
      addMessage(text, 'guide-msg hint');
    } else {
      addMessage('Больше подсказок нет — попробуй или нажми «Готово»', 'guide-msg hint');
    }
    scrollToBottom();
  }

  function addMessage(html, cssClass) {
    const container = document.getElementById('guide-messages');
    const div = document.createElement('div');
    div.className = cssClass || 'guide-msg';
    div.innerHTML = html;
    container.appendChild(div);
  }

  function clearMessages() {
    document.getElementById('guide-messages').innerHTML = '';
  }

  function updateProgress(current, total) {
    const label = document.getElementById('step-label');
    const fill = document.getElementById('progress-fill');
    label.textContent = `Шаг ${current + 1}/${total}`;
    fill.style.width = `${((current) / total) * 100}%`;
  }

  function scrollToBottom() {
    const container = document.getElementById('guide-messages');
    container.scrollTop = container.scrollHeight;
  }

  function sendHintRequest() {
    if (guideWs && guideWs.readyState === WebSocket.OPEN) {
      guideWs.send(JSON.stringify({ type: 'hint' }));
    }
  }

  function sendDone() {
    if (guideWs && guideWs.readyState === WebSocket.OPEN) {
      guideWs.send(JSON.stringify({ type: 'done' }));
    }
  }

  function sendStart() {
    if (guideWs && guideWs.readyState === WebSocket.OPEN) {
      guideWs.send(JSON.stringify({ type: 'start' }));
    }
  }

  function sendReset() {
    if (guideWs && guideWs.readyState === WebSocket.OPEN) {
      guideWs.send(JSON.stringify({ type: 'reset' }));
    }
  }

  function sendActivity() {
    if (guideWs && guideWs.readyState === WebSocket.OPEN) {
      guideWs.send(JSON.stringify({ type: 'activity' }));
    }
  }

  function onMessage(callback) {
    _externalHandlers.push(callback);
  }

  return {
    init,
    onMessage,
    sendHintRequest,
    sendDone,
    sendStart,
    sendReset,
    sendActivity,
    clearMessages,
    updateProgress,
  };
})();
```

- [ ] **Step 2: Commit**

```bash
git add public/js/guide.js
git commit -m "feat: add Guide panel with chat messages, hints, and WebSocket"
```

---

### Task 10: Wire Guide WebSocket on Server

**Files:**
- Modify: `server/index.js`

Connect the StepEngine to the `/ws/guide` WebSocket endpoint so the guide panel can receive step data and send user actions.

- [ ] **Step 1: Update server/index.js with guide WebSocket logic**

Add after the terminal manager setup in `startServer()`:

```js
const { StepEngine } = require('./stepEngine.js');
const stepsConfig = require('./steps.json');

// Inside startServer():
const stepEngine = new StepEngine(stepsConfig);

// Track guide clients
const guideClients = new Set();

// Step engine events → broadcast to guide clients
stepEngine.on('step_change', (data) => {
  broadcast(guideClients, { type: 'step', ...data });
  // Handle capture monitor lifecycle
  if (data.step.show_capture) {
    const cmd = stepEngine.getCaptureCommand();
    if (cmd && !tm.capture) {
      tm.createCapture(cmd);
      broadcast(captureClients(), { type: 'info', message: 'capture started' });
    }
  } else if (tm.capture) {
    tm.destroyCapture();
  }
});

stepEngine.on('step_validated', (data) => {
  broadcast(guideClients, { type: 'step_validated', ...data });
  // Auto-advance after a short delay
  setTimeout(() => stepEngine.advance(), 500);
});

stepEngine.on('completed', (data) => {
  broadcast(guideClients, { type: 'completed', ...data });
  tm.destroyCapture();
});

stepEngine.on('reset', () => {
  broadcast(guideClients, { type: 'reset' });
});

// Feed terminal output to step engine for validation
tm.onMainData((data) => {
  stepEngine.checkOutput('main', data);
});

tm.onCaptureData((data) => {
  stepEngine.checkOutput('capture', data);
});

// In the wss.on('connection') handler, update the guide case:
// ... else if (url === '/ws/guide') {
  ws._endpoint = 'guide';
  guideClients.add(ws);
  ws.on('close', () => guideClients.delete(ws));

  ws.on('message', (msg) => {
    const parsed = JSON.parse(msg);
    switch (parsed.type) {
      case 'start':
        stepEngine.reset();
        stepEngine.advance(); // Move from welcome to first real step
        break;
      case 'hint':
        const hint = stepEngine.getNextHint();
        ws.send(JSON.stringify({ type: 'hint', text: hint }));
        break;
      case 'done':
        stepEngine.forceAdvance();
        setTimeout(() => stepEngine.advance(), 500);
        break;
      case 'reset':
        // Full reset — handled by session manager (Task 11)
        break;
      case 'activity':
        // Reset inactivity timer — handled by session manager (Task 11)
        break;
      case 'sync':
        // Send current state
        ws.send(JSON.stringify({
          type: 'sync',
          currentStep: stepEngine.currentStepIndex,
          totalSteps: stepEngine.steps.length,
          step: stepEngine.getCurrentStep(),
        }));
        break;
    }
  });

  // Send initial step
  const currentStep = stepEngine.getCurrentStep();
  ws.send(JSON.stringify({
    type: 'step',
    step: currentStep,
    index: stepEngine.currentStepIndex,
    total: stepEngine.steps.length,
    messages: currentStep.messages,
  }));
// ...

function broadcast(clients, data) {
  const msg = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

function captureClients() {
  const clients = new Set();
  wss.clients.forEach((c) => {
    if (c._endpoint === 'capture' && c.readyState === 1) clients.add(c);
  });
  return clients;
}
```

- [ ] **Step 2: Verify step flow works end-to-end**

Run: `node server/index.js` → open browser → verify welcome messages appear in guide panel, "Готово" advances steps.

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: wire StepEngine to guide WebSocket with full step flow"
```

---

## Chunk 4: Session Management + Completion

### Task 11: Session Manager

**Files:**
- Create: `server/sessionManager.js`
- Test: `tests/sessionManager.test.js`

- [ ] **Step 1: Write session manager tests**

Create `tests/sessionManager.test.js`:

```js
const { SessionManager } = require('../server/sessionManager.js');

describe('SessionManager', () => {
  let sm;

  beforeEach(() => {
    sm = new SessionManager({ timeoutMs: 500, warningMs: 300 });
  });

  afterEach(() => {
    sm.stop();
  });

  test('starts timer and emits warning', (done) => {
    sm.on('warning', (data) => {
      expect(data.remainingSec).toBeDefined();
      done();
    });
    sm.start();
  }, 2000);

  test('activity resets the timer', (done) => {
    let warningCount = 0;
    sm.on('warning', () => warningCount++);

    sm.start();
    // Reset before warning fires
    setTimeout(() => sm.activity(), 200);
    // Check that warning hasn't fired at 400ms (it would have at 300ms without reset)
    setTimeout(() => {
      expect(warningCount).toBe(0);
      done();
    }, 450);
  }, 2000);

  test('emits timeout after inactivity', (done) => {
    sm.on('timeout', () => {
      done();
    });
    sm.start();
  }, 2000);

  test('logSession appends to log', () => {
    const fs = require('fs');
    const logPath = '/tmp/test-sessions.log';
    // Clean up
    try { fs.unlinkSync(logPath); } catch(e) {}

    sm.logPath = logPath;
    sm.logSession({ completed: true, duration_sec: 100, steps_reached: 8, hints_used: 3 });

    const content = fs.readFileSync(logPath, 'utf8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.completed).toBe(true);
    expect(parsed.duration_sec).toBe(100);

    // Clean up
    fs.unlinkSync(logPath);
  });

  test('stop clears all timers', () => {
    sm.start();
    sm.stop();
    // Should not throw or emit after stop
    expect(sm._timer).toBeNull();
    expect(sm._warningTimer).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/sessionManager.test.js --verbose`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Write server/sessionManager.js**

```js
const fs = require('fs');
const path = require('path');

class SessionManager {
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs || 5 * 60 * 1000; // 5 minutes
    this.warningMs = options.warningMs || 4 * 60 * 1000; // 4 minutes
    this.logPath = options.logPath || path.join(__dirname, 'sessions.log');

    this._timer = null;
    this._warningTimer = null;
    this._listeners = [];
    this._lastActivity = Date.now();
  }

  start() {
    this.stop();
    this._lastActivity = Date.now();

    this._warningTimer = setTimeout(() => {
      const remaining = Math.ceil((this.timeoutMs - this.warningMs) / 1000);
      this._emit('warning', { remainingSec: remaining });
    }, this.warningMs);

    this._timer = setTimeout(() => {
      this._emit('timeout', {});
    }, this.timeoutMs);
  }

  activity() {
    this._lastActivity = Date.now();
    // Restart timers
    this.start();
  }

  stop() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._warningTimer) {
      clearTimeout(this._warningTimer);
      this._warningTimer = null;
    }
  }

  logSession(data) {
    const entry = {
      timestamp: new Date().toISOString(),
      ...data,
    };
    fs.appendFileSync(this.logPath, JSON.stringify(entry) + '\n');
  }

  on(event, callback) {
    this._listeners.push({ event, callback });
  }

  _emit(event, data) {
    this._listeners
      .filter(l => l.event === event)
      .forEach(l => l.callback(data));
  }
}

module.exports = { SessionManager };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/sessionManager.test.js --verbose`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/sessionManager.js tests/sessionManager.test.js
git commit -m "feat: add SessionManager with inactivity timer and logging"
```

---

### Task 12: Wire Session Manager into Server

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Integrate session manager in server/index.js**

Add to `startServer()`:

```js
const { SessionManager } = require('./sessionManager.js');

const sessionManager = new SessionManager();

sessionManager.on('warning', (data) => {
  broadcast(guideClients, {
    type: 'inactivity_warning',
    remainingSec: data.remainingSec,
  });
});

sessionManager.on('timeout', () => {
  // Full reset
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
  tm.createMain();
  // Re-attach main data listener
  tm.onMainData((data) => {
    wss.clients.forEach((client) => {
      if (client.readyState === 1 && client._endpoint === 'terminal') {
        client.send(data);
      }
    });
    stepEngine.checkOutput('main', data);
    sessionManager.activity();
  });
  broadcast(guideClients, { type: 'reset' });
  sessionManager.start();
}

// Track activity from terminal input
// (modify the terminal ws.on('message') handler to also call):
sessionManager.activity();

// Also handle guide 'reset' and 'activity' messages:
// case 'reset': performReset(); break;
// case 'activity': sessionManager.activity(); break;

// Start session manager when first guide client connects
sessionManager.start();

// On completion:
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
```

- [ ] **Step 2: Verify reset flow works**

Run: `node server/index.js` → open browser → verify inactivity warning appears, reset works.

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: integrate SessionManager with reset and activity tracking"
```

---

### Task 13: App.js — Main Orchestrator

**Files:**
- Create: `public/js/app.js`

- [ ] **Step 1: Create public/js/app.js**

```js
/**
 * App — main orchestrator. Initializes modules, manages screen transitions,
 * handles session timer display, and coordinates guide/terminal interactions.
 */
(function() {
  // Screen management
  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }

  // Session timer
  let timerInterval = null;
  let sessionStartTime = null;

  function startTimer() {
    sessionStartTime = Date.now();
    const timerEl = document.getElementById('session-timer');
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function getElapsedSeconds() {
    return sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
  }

  // Initialize guide with callbacks
  Guide.init({
    onStepReady: (stepData) => {
      // Show/hide capture monitor based on step config
      if (stepData.step && stepData.step.show_capture) {
        WifiTerminal.showCapture();
      } else {
        WifiTerminal.hideCapture();
      }
    },
  });

  // Initialize terminals
  WifiTerminal.initMain(document.getElementById('terminal-main'));
  WifiTerminal.initCapture(document.getElementById('terminal-capture'));

  // Welcome screen → Lab screen
  document.getElementById('btn-start').addEventListener('click', () => {
    showScreen('lab-screen');
    WifiTerminal.focus();
    startTimer();
    Guide.sendStart();
  });

  // Hint button
  document.getElementById('btn-hint').addEventListener('click', () => {
    Guide.sendHintRequest();
    Guide.sendActivity();
  });

  // Done button
  document.getElementById('btn-done').addEventListener('click', () => {
    Guide.sendDone();
    Guide.sendActivity();
  });

  // Reset button
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('Сбросить сессию? Весь прогресс будет потерян.')) {
      Guide.sendReset();
      resetUI();
    }
  });

  // Restart button (completion screen)
  document.getElementById('btn-restart').addEventListener('click', () => {
    Guide.sendReset();
    resetUI();
  });

  // Inactivity warning — "I'm here" button
  document.getElementById('btn-still-here').addEventListener('click', () => {
    document.getElementById('inactivity-warning').classList.add('hidden');
    Guide.sendActivity();
  });

  // Listen for guide WebSocket messages via Guide's event bus (no duplicate WS)
  Guide.onMessage((msg) => {
    if (msg.type === 'completed') {
      stopTimer();
      Completion.show({
        password: msg.password,
        durationSec: getElapsedSeconds(),
        hintsUsed: msg.stats ? msg.stats.hintsUsed : 0,
        stepsCompleted: msg.stats ? msg.stats.stepsCompleted : 0,
      });
      showScreen('completion-screen');
    }

    if (msg.type === 'reset') {
      resetUI();
    }

    if (msg.type === 'inactivity_warning') {
      const warning = document.getElementById('inactivity-warning');
      warning.classList.remove('hidden');
      let countdown = msg.remainingSec;
      const countdownEl = document.getElementById('inactivity-countdown');
      countdownEl.textContent = countdown;
      const countdownInterval = setInterval(() => {
        countdown--;
        countdownEl.textContent = countdown;
        if (countdown <= 0) clearInterval(countdownInterval);
      }, 1000);
    }
  });

  function resetUI() {
    stopTimer();
    showScreen('welcome-screen');
    Guide.clearMessages();
    Guide.updateProgress(0, 8);
    WifiTerminal.hideCapture();
    WifiTerminal.clearMain();
    WifiTerminal.clearCapture();
    document.getElementById('inactivity-warning').classList.add('hidden');
  }
})();
```

- [ ] **Step 2: Verify full flow in browser**

Run: `node server/index.js` → open browser → click Start → see welcome messages → click Done to advance → verify step progression.

- [ ] **Step 3: Commit**

```bash
git add public/js/app.js
git commit -m "feat: add app.js orchestrator with screen management and timer"
```

---

### Task 14: Completion Screen

**Files:**
- Create: `public/js/completion.js`

- [ ] **Step 1: Create public/js/completion.js**

```js
/**
 * Completion module — shows results screen with Matrix rain animation,
 * stats summary, and QR code.
 */
const Completion = (() => {
  let rainAnimationId = null;

  function show({ password, durationSec, hintsUsed, stepsCompleted }) {
    // Display password
    document.getElementById('found-password').textContent = password;

    // Display stats
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    document.getElementById('completion-stats').innerHTML = `
      <div class="stat-item">
        <span class="stat-value">${mins}:${String(secs).padStart(2, '0')}</span>
        <span class="stat-label">Время</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${stepsCompleted}/8</span>
        <span class="stat-label">Шагов</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${hintsUsed}</span>
        <span class="stat-label">Подсказок</span>
      </div>
    `;

    // Generate QR code placeholder
    // In production, use a QR library or a pre-generated QR image
    document.getElementById('qr-code').innerHTML = `
      <p style="color: var(--text-dim); font-size: 12px;">
        Узнай больше о пентесте WiFi →<br>
        <span style="color: var(--text-secondary);">QR-код с материалами</span>
      </p>
    `;

    // Start Matrix rain
    startMatrixRain();
  }

  function hide() {
    stopMatrixRain();
  }

  function startMatrixRain() {
    const canvas = document.getElementById('matrix-rain');
    const ctx = canvas.getContext('2d');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';
    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops = new Array(columns).fill(1);

    function draw() {
      ctx.fillStyle = 'rgba(10, 15, 10, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#00ff41';
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillStyle = Math.random() > 0.98 ? '#ffffff' : '#00ff41';
        ctx.globalAlpha = 0.3 + Math.random() * 0.5;
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);
        ctx.globalAlpha = 1;

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }

      rainAnimationId = requestAnimationFrame(draw);
    }

    draw();

    // Resize handler
    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
  }

  function stopMatrixRain() {
    if (rainAnimationId) {
      cancelAnimationFrame(rainAnimationId);
      rainAnimationId = null;
    }
  }

  return { show, hide };
})();
```

- [ ] **Step 2: Commit**

```bash
git add public/js/completion.js
git commit -m "feat: add completion screen with Matrix rain and stats"
```

---

## Chunk 5: Deployment + Final Integration

### Task 15: Wordlist

**Files:**
- Create: `server/wordlist.txt`

- [ ] **Step 1: Generate wordlist**

Create `server/wordlist.txt` — a small dictionary (~1000 common passwords). The actual router password should be placed around line 300-500 so brute force takes a few seconds.

```bash
# Generate a basic wordlist with common passwords
# The actual target password (e.g., "security2024") should be added during booth setup
cat > server/wordlist.txt << 'WORDLIST'
password
123456
12345678
qwerty
abc123
monkey
1234567
letmein
trustno1
dragon
baseball
iloveyou
master
sunshine
ashley
michael
shadow
123123
654321
superman
...
WORDLIST
```

Note: A full 1000-word list should be generated. Use a well-known password list (like a subset of rockyou.txt) and insert the target password at a specific position. The exact password is configured in `steps.json` and set on the router at the booth.

- [ ] **Step 2: Commit**

```bash
git add server/wordlist.txt
git commit -m "feat: add wordlist dictionary for aircrack-ng demo"
```

---

### Task 16: Deployment Scripts

**Files:**
- Create: `scripts/setup.sh`
- Create: `scripts/reset.sh`

- [ ] **Step 1: Create scripts/setup.sh**

```bash
#!/bin/bash
# WiFi Lab — Kali Linux setup script
# Run once after booting Kali Live with persistence

set -e

echo "[*] WiFi Lab Setup"
echo "[*] Updating packages..."
apt update

echo "[*] Installing dependencies..."
apt install -y nodejs npm aircrack-ng

echo "[*] Installing Node.js packages..."
cd "$(dirname "$0")/.."
npm install --production

echo "[*] Checking aircrack-ng..."
if command -v aircrack-ng &> /dev/null; then
    echo "[+] aircrack-ng installed: $(aircrack-ng --version 2>&1 | head -1)"
else
    echo "[-] ERROR: aircrack-ng not found!"
    exit 1
fi

echo "[*] Checking node..."
echo "[+] Node.js: $(node --version)"

echo ""
echo "[+] Setup complete!"
echo "[+] Run: sudo node server/index.js"
echo "[+] Then open: http://localhost:3000"
```

- [ ] **Step 2: Create scripts/reset.sh**

```bash
#!/bin/bash
# WiFi Lab — Reset network interfaces
# Called by session manager or manually between participants

echo "[*] Resetting WiFi Lab network state..."

# Kill any running aircrack-ng processes
pkill -f airodump-ng 2>/dev/null || true
pkill -f aireplay-ng 2>/dev/null || true
pkill -f aircrack-ng 2>/dev/null || true

# Kill interfering processes
airmon-ng check kill 2>/dev/null || true

# Stop monitor mode if active
for iface in $(iw dev | grep Interface | awk '{print $2}' | grep mon); do
    echo "[*] Stopping monitor mode on $iface"
    airmon-ng stop "$iface" 2>/dev/null || true
done

# Restart NetworkManager (needed for normal WiFi after demo)
systemctl restart NetworkManager 2>/dev/null || true

# Clean up capture files
rm -f /tmp/wifilab_capture* 2>/dev/null || true

echo "[+] Reset complete"
```

- [ ] **Step 3: Make scripts executable**

```bash
chmod +x scripts/setup.sh scripts/reset.sh
```

- [ ] **Step 4: Commit**

```bash
git add scripts/
git commit -m "feat: add setup and reset scripts for Kali deployment"
```

---

### Task 17: Server Refactor — Clean Integration

**Files:**
- Modify: `server/index.js`

The server has been built incrementally across tasks 2, 4, 10, and 12. This task rewrites it as a clean, final version integrating all components.

- [ ] **Step 1: Rewrite server/index.js as final integrated version**

Replace `server/index.js` entirely with this complete file:

```js
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
const HOST = '127.0.0.1'; // localhost only — security requirement

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

  // --- Core components ---
  const tm = new TerminalManager();
  const stepEngine = new StepEngine(stepsConfig);
  const sessionManager = new SessionManager();

  // --- Client tracking ---
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

  // --- Terminal setup ---
  function setupTerminalCallbacks() {
    tm.onMainData((data) => {
      broadcast(terminalClients(), data);
      stepEngine.checkOutput('main', data);
      sessionManager.activity();
    });

    tm.onCaptureData((data) => {
      broadcast(captureClients(), data);
      stepEngine.checkOutput('capture', data);
      sessionManager.activity();
    });
  }

  tm.createMain();
  setupTerminalCallbacks();

  // --- Step Engine events ---
  stepEngine.on('step_change', (data) => {
    broadcast(guideClients, { type: 'step', ...data });
    // Capture monitor lifecycle
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

  // Helper: re-register capture callback (after destroyCapture clears them)
  function setupCaptureCallback() {
    tm.onCaptureData((data) => {
      broadcast(captureClients(), data);
      stepEngine.checkOutput('capture', data);
      sessionManager.activity();
    });
  }

  // --- Session Manager events ---
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

  // --- Reset ---
  function performReset() {
    stepEngine.reset();
    tm.destroyCapture();
    tm.destroyMain(); // clears callbacks
    // Run network cleanup script (best-effort)
    try {
      execSync('bash scripts/reset.sh', { cwd: path.join(__dirname, '..'), timeout: 10000 });
    } catch (e) { /* ignore on non-Kali systems */ }
    tm.createMain();
    setupTerminalCallbacks(); // re-register after destroyMain cleared them
    broadcast(guideClients, { type: 'reset' });
    sessionManager.start();
  }

  // --- WebSocket connections ---
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
        } catch (e) { /* ignore bad JSON */ }
      });

    } else if (url === '/ws/capture') {
      ws._endpoint = 'capture';
      // Read-only — no input handling

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
        } catch (e) { /* ignore bad JSON */ }
      });

      // Send initial step on connect
      const currentStep = stepEngine.getCurrentStep();
      ws.send(JSON.stringify({
        type: 'step',
        step: currentStep,
        index: stepEngine.currentStepIndex,
        total: stepEngine.steps.length,
        messages: currentStep ? currentStep.messages : [],
      }));

    } else {
      ws.close(4000, 'Unknown endpoint');
    }
  });

  // --- Start ---
  server.listen(PORT, HOST, () => {
    console.log(`WiFi Lab running at http://${HOST}:${PORT}`);
  });

  return { app, server, wss, tm, stepEngine, sessionManager };
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
```

- [ ] **Step 2: Run all existing tests**

Run: `npx jest --verbose`
Expected: ALL PASS

- [ ] **Step 3: Manual end-to-end test**

Run: `node server/index.js` → open `http://localhost:3000` → walk through:
1. Welcome screen → click "Начать"
2. Guide messages appear with step instructions
3. Terminal is interactive
4. Hint button reveals progressive hints
5. Done button advances steps
6. Reset button resets to welcome
7. Session timer counts up

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "refactor: clean server integration with all components wired"
```

---

### Task 18: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

```markdown
# WiFi Lab

Interactive WiFi penetration testing lab for conference booths.

## What is this?

A web-based guided experience where participants perform a real WPA2 WiFi attack
on a controlled router, step by step. Built for the Socol SOC conference booth
by Meta Scan red team.

## Hardware Required

- Laptop (any, will boot from USB)
- Kali Linux Live USB (with persistence)
- USB WiFi adapter with monitor mode (e.g., Alfa AWUS036ACH)
- WiFi router (WPA2-PSK, weak password)
- Client device connected to router (phone/tablet)

## Quick Start

```bash
# On Kali Linux
sudo bash scripts/setup.sh
sudo node server/index.js
# Open http://localhost:3000
```

## Configuration

Edit `server/steps.json` to set:
- `target_bssid` — MAC address of your router
- `target_ssid` — WiFi network name
- `target_channel` — Router's WiFi channel
- `wordlist_path` — Path to dictionary file

## Tech Stack

Node.js, Express, xterm.js, node-pty, WebSocket
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions"
```

---

## Dependency Graph

```
Task 1 (project init)
  └─► Task 2 (express server)
        └─► Task 3 (terminal manager)
              └─► Task 4 (wire terminal WS)
                    └─► Task 5 (HTML + CSS) ─────────────────┐
                          └─► Task 6 (xterm.js frontend)     │
                                                              │
Task 7 (steps.json) ─────────────────────────────────────────┤
  └─► Task 8 (step engine) ──────────────────────────────────┤
        └─► Task 9 (guide frontend) ─────────────────────────┤
              └─► Task 10 (wire guide WS) ───────────────────┤
                                                              │
Task 11 (session manager) ───────────────────────────────────┤
  └─► Task 12 (wire session manager) ────────────────────────┤
                                                              │
Task 13 (app.js orchestrator) ◄───────────────────────────────┤
  └─► Task 14 (completion screen)                             │
                                                              │
Task 15 (wordlist) ───────────────────────────────────────────┤
Task 16 (deployment scripts) ─────────────────────────────────┤
                                                              │
Task 17 (server refactor — clean integration) ◄───────────────┘
  └─► Task 18 (README)
```

**Parallelizable groups:**
- Tasks 7-8 can run in parallel with Tasks 5-6 (backend engine vs frontend terminal)
- Tasks 11 can run in parallel with Tasks 9-10 (session manager vs guide panel)
- Task 15 and 16 can run in parallel with everything in Chunk 4

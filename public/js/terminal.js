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

    connectMainWs();

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

    window.addEventListener('resize', () => {
      if (mainFitAddon) mainFitAddon.fit();
      if (captureFitAddon) captureFitAddon.fit();
    });
  }

  function connectMainWs() {
    mainWs = createWebSocket('/ws/terminal');
    mainWs.onopen = () => {
      mainWs.send(JSON.stringify({
        type: 'resize',
        cols: mainTerm.cols,
        rows: mainTerm.rows,
      }));
    };
    mainWs.onmessage = (event) => mainTerm.write(event.data);
    mainWs.onclose = () => setTimeout(connectMainWs, 2000);
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

    connectCaptureWs();
  }

  function connectCaptureWs() {
    captureWs = createWebSocket('/ws/capture');
    captureWs.onmessage = (event) => captureTerm.write(event.data);
    captureWs.onclose = () => setTimeout(connectCaptureWs, 2000);
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

  function clearMain() { if (mainTerm) mainTerm.clear(); }
  function clearCapture() { if (captureTerm) captureTerm.clear(); }
  function focus() { if (mainTerm) mainTerm.focus(); }

  return { initMain, initCapture, showCapture, hideCapture, clearMain, clearCapture, focus };
})();

const os = require('os');
const { TerminalManager } = require('../server/terminal.js');

// On Windows use a long-running command that keeps the process alive
const LONG_RUNNING = os.platform() === 'win32'
  ? 'timeout /t 999 /nobreak'
  : 'sleep 999';

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
    tm.createCapture(LONG_RUNNING);
    expect(tm.capture).toBeDefined();
    tm.destroyCapture();
    expect(tm.capture).toBeNull();
  });

  test('destroyAll kills both terminals', () => {
    tm = new TerminalManager();
    tm.createMain();
    tm.createCapture(LONG_RUNNING);
    tm.destroyAll();
    expect(tm.main).toBeNull();
    expect(tm.capture).toBeNull();
  });

  test('onMainData callback receives output', (done) => {
    tm = new TerminalManager();
    tm.onMainData((data) => {
      expect(typeof data).toBe('string');
      done();
    });
    tm.createMain();
    tm.writeMain('echo hello\r');
  });
});

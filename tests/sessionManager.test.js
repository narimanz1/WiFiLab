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
    setTimeout(() => sm.activity(), 200);
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
    const path = require('path');
    const logPath = path.join(require('os').tmpdir(), 'test-sessions.log');
    try { fs.unlinkSync(logPath); } catch(e) {}

    sm.logPath = logPath;
    sm.logSession({ completed: true, duration_sec: 100, steps_reached: 8, hints_used: 3 });

    const content = fs.readFileSync(logPath, 'utf8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.completed).toBe(true);
    expect(parsed.duration_sec).toBe(100);

    fs.unlinkSync(logPath);
  });

  test('stop clears all timers', () => {
    sm.start();
    sm.stop();
    expect(sm._timer).toBeNull();
    expect(sm._warningTimer).toBeNull();
  });
});

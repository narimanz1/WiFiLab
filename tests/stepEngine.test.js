const { StepEngine } = require('../server/stepEngine.js');
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
    const resultRightSource = engine.checkOutput('capture', 'WPA handshake: AA:BB:CC:DD:EE:FF');
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

  test('interpolates target_bssid in hints', () => {
    engine.currentStepIndex = 5; // deauth — 3rd hint contains {target_bssid}
    engine.getNextHint(); // skip hint 1
    engine.getNextHint(); // skip hint 2
    const hint3 = engine.getNextHint(); // hint 3 has the full command with BSSID
    expect(hint3).toContain(stepsConfig.target_bssid);
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

  test('forceAdvance emits step_validated event', () => {
    let emitted = null;
    engine.on('step_validated', (data) => { emitted = data; });
    engine.currentStepIndex = 2;
    engine.forceAdvance();
    expect(emitted).not.toBeNull();
    expect(emitted.stepId).toBe('monitor_mode');
    expect(emitted.forced).toBe(true);
  });

  test('getCaptureCommand returns interpolated command', () => {
    engine.currentStepIndex = 4; // target_capture — has capture_command
    const cmd = engine.getCaptureCommand();
    expect(cmd).toContain(stepsConfig.target_bssid);
    expect(cmd).toContain(stepsConfig.target_channel);
    expect(cmd).toContain('airodump-ng');
  });

  test('checkOutput uses buffer to handle split chunks', () => {
    engine.currentStepIndex = 7; // crack — pattern is 'KEY FOUND!'
    engine.checkOutput('main', 'Trying passwords... KEY FO');
    expect(engine.isComplete()).toBe(false);
    engine.checkOutput('main', 'UND! [ secret123 ]');
    expect(engine.isComplete()).toBe(true);
  });

  test('checkOutput fires only once per step (no duplicate validation)', () => {
    let fireCount = 0;
    engine.on('step_validated', () => fireCount++);
    engine.currentStepIndex = 2; // monitor_mode
    engine.checkOutput('main', 'wlan0mon monitor mode enabled');
    engine.checkOutput('main', 'wlan0mon monitor mode enabled again');
    engine.checkOutput('main', 'wlan0mon yet another line');
    expect(fireCount).toBe(1);
  });

  test('advance clears output buffers', () => {
    engine.currentStepIndex = 2; // monitor_mode
    engine.checkOutput('main', 'wlan0mon monitor mode');
    engine.advance(); // go to step 3
    // Buffer should be clean — old output should not match new step
    expect(engine._outputBuffers.main).toBe('');
  });

  test('forceAdvance only fires once', () => {
    let fireCount = 0;
    engine.on('step_validated', () => fireCount++);
    engine.currentStepIndex = 2;
    engine.forceAdvance();
    engine.forceAdvance(); // second call should be ignored
    expect(fireCount).toBe(1);
  });
});

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
      cwd: process.env.HOME || process.env.USERPROFILE || '/root',
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
      cols: 200,
      rows: 24,
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
      try { this.main.kill(); } catch (e) {}
      this.main = null;
    }
    this._mainDataCallbacks = [];
  }

  destroyCapture() {
    if (this.capture) {
      try { this.capture.kill(); } catch (e) {}
      this.capture = null;
    }
    this._captureDataCallbacks = [];
  }

  destroyAll() {
    this.destroyMain();
    this.destroyCapture();
  }
}

module.exports = { TerminalManager };

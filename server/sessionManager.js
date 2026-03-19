const fs = require('fs');
const path = require('path');

class SessionManager {
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs || 5 * 60 * 1000;
    this.warningMs = options.warningMs || 4 * 60 * 1000;
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

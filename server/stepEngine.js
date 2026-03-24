class StepEngine {
  constructor(config) {
    this.config = config;
    this.steps = config.steps;
    this.currentStepIndex = 0;
    this.currentHintIndex = 0;
    this.hintsUsed = 0;
    this.startTime = Date.now();
    this._completed = false;
    this._stepValidated = false; // guard: prevent multiple fires per step
    this._advancing = false;     // guard: prevent overlapping advance() calls
    this._listeners = [];
    this._outputBuffers = { main: '', capture: '' };
  }

  getCurrentStep() {
    return this.steps[this.currentStepIndex] || null;
  }

  advance() {
    // Guard against multiple advance() from queued timeouts
    if (this._advancing) return;
    this._advancing = true;

    if (this.currentStepIndex < this.steps.length - 1) {
      this.currentStepIndex++;
      this.currentHintIndex = 0;
      this._stepValidated = false;
      // Clear buffers so old output doesn't match new step patterns
      this._outputBuffers = { main: '', capture: '' };
      this._emit('step_change', {
        step: this.getCurrentStep(),
        index: this.currentStepIndex,
        total: this.steps.length,
      });
    }

    this._advancing = false;
  }

  checkOutput(source, data) {
    const step = this.getCurrentStep();
    if (!step || step.validation.type !== 'output_match') return false;
    // Already validated this step — wait for advance()
    if (this._stepValidated) return false;

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
      // Lock: prevent this step from firing again
      this._stepValidated = true;

      if (this.currentStepIndex === this.steps.length - 1) {
        const pwdMatch = this._outputBuffers[source].match(/KEY FOUND!\s*\[\s*(.+?)\s*\]/);
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
    if (this._stepValidated) return; // already validated
    this._stepValidated = true;
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
    this._stepValidated = false;
    this._advancing = false;
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

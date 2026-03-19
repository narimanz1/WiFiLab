(function() {
  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }

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
    Completion.hide();
    showScreen('welcome-screen');
    Guide.clearMessages();
    Guide.updateProgress(0, 8);
    WifiTerminal.hideCapture();
    WifiTerminal.clearMain();
    WifiTerminal.clearCapture();
    document.getElementById('inactivity-warning').classList.add('hidden');
  }
})();

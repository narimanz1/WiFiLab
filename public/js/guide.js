const Guide = (() => {
  let guideWs = null;
  let onStepReady = null;
  let lastRenderedStepIndex = -1;
  const _externalHandlers = [];

  function init(callbacks) {
    onStepReady = callbacks.onStepReady || null;
    connectWs();
  }

  function connectWs() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    guideWs = new WebSocket(`${protocol}//${location.host}/ws/guide`);

    guideWs.onopen = () => {
      guideWs.send(JSON.stringify({ type: 'sync' }));
    };

    guideWs.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
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
      case 'sync':
        clearMessages();
        if (msg.messages) {
          msg.messages.forEach(m => addMessage(m.text, m.cssClass));
        }
        updateProgress(msg.currentStep, msg.totalSteps);
        break;
    }
  }

  function renderStep(stepData) {
    // Skip if we already rendered this step (prevents duplicates from sync + broadcast)
    if (stepData.index === lastRenderedStepIndex) return;
    lastRenderedStepIndex = stepData.index;

    const container = document.getElementById('guide-messages');
    const messages = stepData.messages || (stepData.step && stepData.step.messages) || [];
    messages.forEach((text, i) => {
      setTimeout(() => {
        addMessage(text, 'guide-msg');
        container.scrollTop = container.scrollHeight;
      }, i * 400);
    });
    updateProgress(stepData.index, stepData.total);
    if (onStepReady) onStepReady(stepData);
  }

  function renderSuccess(text) {
    if (text) addMessage(text, 'guide-msg success');
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
    lastRenderedStepIndex = -1;
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
    init, onMessage, sendHintRequest, sendDone, sendStart, sendReset, sendActivity,
    clearMessages, updateProgress,
  };
})();

const Completion = (() => {
  let rainAnimationId = null;

  function show({ password, durationSec, hintsUsed, stepsCompleted }) {
    document.getElementById('found-password').textContent = password;

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

    document.getElementById('qr-code').innerHTML = `
      <p style="color: var(--text-dim); font-size: 12px;">
        Узнай больше о пентесте WiFi →<br>
        <span style="color: var(--text-secondary);">QR-код с материалами</span>
      </p>
    `;

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

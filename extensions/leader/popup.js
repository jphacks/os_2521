(async () => {
  const startBtn = document.getElementById('start');
  const stopBtn = document.getElementById('stop');
  const grid = document.getElementById('grid');
  const statusEl = document.getElementById('status');

  // アクティブなタブ（Meet想定）を取得
  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  function ensureCell(idx) {
    let cell = document.querySelector(`[data-idx="${idx}"]`);
    if (!cell) {
      cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.idx = idx;
      const img = document.createElement('img');
      img.alt = `#${idx}`;
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.textContent = `#${idx}`;
      cell.appendChild(img);
      cell.appendChild(cap);
      grid.appendChild(cell);
    }
    return cell;
  }

  // Start: Meetタブのcontent scriptへ開始メッセージ
  startBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!/^https:\/\/meet\.google\.com/.test(tab.url || '')) {
      statusEl.textContent = 'このタブはGoogle Meetではありません';
      return;
    }
    await chrome.tabs.sendMessage(tab.id, { cmd: 'START' });
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusEl.textContent = 'starting…';
  });

  // Stop
  stopBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    await chrome.tabs.sendMessage(tab.id, { cmd: 'STOP' });
    startBtn.disabled = false;
    stopBtn.disabled = true;
    grid.innerHTML = '';
    statusEl.textContent = 'stopped';
  });

  // content.js → popup へのフレーム/情報受信
  chrome.runtime.onMessage.addListener((msg, sender) => {
    // ほかのタブからのメッセージは無視
    // （ポップアップはアクティブタブだけを監視する想定）
    if (!sender.tab || !sender.tab.active) return;

    if (msg.type === 'VIDEOS_COUNT') {
      statusEl.textContent = `videos: ${msg.count}`;
    } else if (msg.type === 'FRAME') {
      const cell = ensureCell(msg.index);
      const img = cell.querySelector('img');
      const cap = cell.querySelector('.cap');
      img.src = msg.dataUrl;  // サムネ（更新）
      cap.textContent = `#${msg.index} ${msg.w}x${msg.h}`;
    } else if (msg.type === 'STATUS') {
      statusEl.textContent = msg.text;
    }
  });
})();
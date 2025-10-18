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

  async function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (res) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        resolve(res);
      });
    });
  }

  // Start: Meetタブのcontent scriptへ開始メッセージ
  startBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!/^https:\/\/meet\.google\.com/.test(tab.url || '')) {
      statusEl.textContent = 'このタブはGoogle Meetではありません';
      return;
    }

    let meetingId = '';
      try {
        const url = new URL(tab.url);
        const parts = url.pathname.split('/').filter(Boolean);
        meetingId = parts.length ? parts[parts.length - 1] : '';
      } catch (e) {}
    if (!meetingId) {
      statusEl.textContent = 'URL から meetingId を取得できませんでした';
      console.error('Cannot extract meetingId from URL:', tab.url);
      return;
    }

    // content.js
    await chrome.tabs.sendMessage(tab.id, { cmd: 'START' });
    // background.js
    chrome.runtime.sendMessage({ cmd: 'CALL_API_START', meetingId });

    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusEl.textContent = 'starting…';
  });


  // Stop
  stopBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();

    let meetingId = '';
      try {
        const url = new URL(tab.url);
        const parts = url.pathname.split('/').filter(Boolean);
        meetingId = parts.length ? parts[parts.length - 1] : '';
      } catch (e) {}

    if (!meetingId) {
      statusEl.textContent = 'URL から meetingId を取得できませんでした';
      console.error('Cannot extract meetingId from URL:', tab && tab.url);
      return;
    }

    // 1) content 側を止める（失敗しても処理を続行）
    try {
      await sendMessageToTab(tab.id, { cmd: 'STOP' });
    } catch (err) {
      console.warn('content stop failed (continuing):', err);
      // 必要ならここで注入して再送する実装を追加
    }

    // 2) background に end を依頼（エラーはコールバックで確認）
    chrome.runtime.sendMessage({ cmd: 'CALL_API_END', meetingId }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn('CALL_API_END sendMessage error:', chrome.runtime.lastError);
        statusEl.textContent = '終了API呼び出しに失敗しました';
        return;
      }
      // 任意: res を見て成功/失敗表示
      if (res && res.ok) {
        statusEl.textContent = '計測を終了しました';
      } else {
        statusEl.textContent = `終了APIエラー: ${res && (res.status || res.error)}`;
      }
    });

    // UI 更新（即時）
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
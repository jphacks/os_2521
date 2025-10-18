// background は DOM にアクセスできないので、popup/content からのメッセージを受けて API を呼ぶ実装に置き換えます。

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.cmd !== 'CALL_API_START') return;

  (async () => {
    const meetingId = (msg.meetingId || '').toString().trim();
    if (!meetingId) {
      const result = { ok: false, error: 'missing meetingId' };
      sendResponse && sendResponse(result);
      chrome.runtime.sendMessage({ type: 'API_RESULT', ...result });
      return;
    }

    const apiBase = 'https://pure-elegance-production.up.railway.app';
    const url = `${apiBase.replace(/\/$/, '')}/api/meetings/${encodeURIComponent(meetingId)}/start`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      let body;
      try {
        body = await response.json();
      } catch (e) {
        body = await response.text();
      }

      const result = { ok: response.ok, status: response.status, body };
      sendResponse && sendResponse(result);
      chrome.runtime.sendMessage({ type: 'API_RESULT', ...result });
    } catch (error) {
      const result = { ok: false, error: error.message };
      sendResponse && sendResponse(result);
      chrome.runtime.sendMessage({ type: 'API_RESULT', ...result });
    }
  })();

  // 非同期で sendResponse を使うので true を返す
  return true;
});



// CALL_API_END を受けて /api/meetings/{id}/end を呼ぶ
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.cmd !== 'CALL_API_END') return;

    console.log('background.js received CALL_API_END');

  (async () => {
    const meetingId = (msg.meetingId || '').toString().trim();
    if (!meetingId) {
      const result = { ok: false, error: 'missing meetingId' };
      sendResponse && sendResponse(result);
      chrome.runtime.sendMessage({ type: 'API_RESULT', action: 'end', ...result });
      return;
    }

    const apiBase = 'https://pure-elegance-production.up.railway.app';
    const url = `${apiBase.replace(/\/$/, '')}/api/meetings/${encodeURIComponent(meetingId)}/end`;

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      let body;
      try {
        body = await response.json();
      } catch (e) {
        body = await response.text();
      }

      const result = { ok: response.ok, status: response.status, body };
      sendResponse && sendResponse(result);
      chrome.runtime.sendMessage({ type: 'API_RESULT', action: 'end', ...result });
    } catch (error) {
      const result = { ok: false, error: error.message };
      sendResponse && sendResponse(result);
      chrome.runtime.sendMessage({ type: 'API_RESULT', action: 'end', ...result });
    }
  })();

  // 非同期で sendResponse を使うので true を返す
  return true;
});
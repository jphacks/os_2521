(() => {
  const SIZE = 224;
  const FPS  = 4;               // ポップアップへ送る静止画は軽めでOK
  const MIN_VW = 200, MIN_VH = 150;

  // videoごとの描画ループ状態
  const sessions = new WeakMap();
  let running = false;
  let mo = null;

  function* walkShadow(node) {
    yield node;
    const tw = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
    let cur;
    while ((cur = tw.nextNode())) {
      if (cur.shadowRoot) yield* walkShadow(cur.shadowRoot);
    }
  }

  function findCandidateVideos() {
    const arr = [];
    for (const root of walkShadow(document)) {
      if (root.querySelectorAll) root.querySelectorAll('video').forEach(v => arr.push(v));
    }
    return arr.filter(v => (v.videoWidth|0)>=MIN_VW && (v.videoHeight|0)>=MIN_VH);
  }

  function startOne(videoEl, index) {
    if (sessions.has(videoEl)) return;
    const canvas = new OffscreenCanvas(SIZE, SIZE);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const minDt = 1000 / FPS;
    let last = 0;

    async function pushFrame(ts) {
      if (!running || !videoEl.isConnected || !sessions.has(videoEl)) return;
      if (!videoEl.videoWidth) return;

      if (ts - last >= minDt) {
        const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
        const s  = Math.min(SIZE/vw, SIZE/vh);
        const dw = (vw*s)|0, dh = (vh*s)|0;
        const dx = (SIZE - dw) >> 1, dy = (SIZE - dh) >> 1;
        ctx.clearRect(0,0,SIZE,SIZE);
        ctx.drawImage(videoEl, 0,0, vw, vh, dx, dy, dw, dh);

        // dataURLにしてポップアップへ送る（軽量プレビュー）
        const blob = await canvas.convertToBlob({type:'image/jpeg', quality:0.7});
        const dataUrl = await blobToDataURL(blob);
        chrome.runtime.sendMessage({type:'FRAME', index, dataUrl, w: vw, h: vh});
        last = ts;
      }
      videoEl.requestVideoFrameCallback(pushFrame);
    }

    const kick = () => {
      chrome.runtime.sendMessage({type:'STATUS', text:`capturing #${index} ${videoEl.videoWidth}x${videoEl.videoHeight}`});
      videoEl.requestVideoFrameCallback(pushFrame);
    };

    sessions.set(videoEl, { index, canvas, ctx });
    if (videoEl.readyState >= 2) kick();
    else videoEl.addEventListener('loadeddata', kick, { once:true });
  }

  function stopAll() {
    running = false;
    // WeakMapはforEach不可。参照を外せばGCされる。
    // 動的監視も停止
    if (mo) { mo.disconnect(); mo = null; }
  }

  function scanAndAttachAll() {
    const vids = findCandidateVideos();
    chrome.runtime.sendMessage({type:'VIDEOS_COUNT', count: vids.length});
    vids.forEach((v, idx) => startOne(v, idx));
  }

  function enableDynamicAttach() {
    if (mo) return;
    mo = new MutationObserver(() => { if (running) scanAndAttachAll(); });
    mo.observe(document.documentElement, { childList:true, subtree:true });
    // 初回
    scanAndAttachAll();
  }

  function blobToDataURL(blob) {
    return new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(blob);
    });
  }

  // ポップアップからの操作を受ける
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.cmd === 'START') {
      running = true;
      enableDynamicAttach();
      chrome.runtime.sendMessage({type:'STATUS', text:'running…'});
      sendResponse && sendResponse({});
      return true;
    }
    if (msg.cmd === 'STOP') {
      stopAll();
      chrome.runtime.sendMessage({type:'STATUS', text:'stopped'});
      sendResponse && sendResponse({});
      return true;
    }
  });
})();

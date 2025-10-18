(() => {
  const SIZE = 224;
  const FPS = 4;               // ポップアップへ送る静止画は軽めでOK
  const MIN_VW = 200, MIN_VH = 150;

  // videoごとの描画ループ状態
  const sessions = new WeakMap();
  let running = false;
  let mo = null;

  // 再帰的に隠れたDOMにも探しにいく
  function* walkShadow(node) {
    yield node;
    const tw = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
    let cur;
    while ((cur = tw.nextNode())) {
      if (cur.shadowRoot) yield* walkShadow(cur.shadowRoot);
    }
  }


  // video候補を見つける
  function findCandidateVideos() {
    const arr = [];
    for (const root of walkShadow(document)) {
      if (root.querySelectorAll) root.querySelectorAll('video').forEach(v => arr.push(v));
    }
    return arr.filter(v => (v.videoWidth | 0) >= MIN_VW && (v.videoHeight | 0) >= MIN_VH);
  }


  // // videoから写真を作る
  // function startOne(videoEl, index) {
  //   if (sessions.has(videoEl)) return;
  //   const canvas = new OffscreenCanvas(SIZE, SIZE);
  //   const ctx = canvas.getContext('2d', { willReadFrequently: true });
  //   const minDt = 1000 / FPS;
  //   let last = 0;

<<<<<<< Updated upstream:extensions/leader/content.js
      if (ts - last >= minDt) {
        const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
        const s = Math.min(SIZE / vw, SIZE / vh);
        const dw = (vw * s) | 0, dh = (vh * s) | 0;
        const dx = (SIZE - dw) >> 1, dy = (SIZE - dh) >> 1;
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.drawImage(videoEl, 0, 0, vw, vh, dx, dy, dw, dh);

        // dataURLにしてポップアップへ送る（軽量プレビュー）
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
        const dataUrl = await blobToDataURL(blob);
        chrome.runtime.sendMessage({ type: 'FRAME', index, dataUrl, w: vw, h: vh });
        last = ts;
      }
      videoEl.requestVideoFrameCallback(pushFrame);
    }

    sessions.set(videoEl, { index, canvas, ctx });
    if (videoEl.readyState >= 2) kick();
    else videoEl.addEventListener('loadeddata', kick, { once: true });
=======
  //   async function pushFrame(ts) {
  //     if (!running || !videoEl.isConnected || !sessions.has(videoEl)) return;
  //     if (!videoEl.videoWidth) return;

  //     if (ts - last >= minDt) {
  //       const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
  //       const s = Math.min(SIZE / vw, SIZE / vh);
  //       const dw = (vw * s) | 0, dh = (vh * s) | 0;
  //       const dx = (SIZE - dw) >> 1, dy = (SIZE - dh) >> 1;
  //       ctx.clearRect(0, 0, SIZE, SIZE);
  //       ctx.drawImage(videoEl, 0, 0, vw, vh, dx, dy, dw, dh);   // 画像作成くん

  //       // dataURLにしてポップアップへ送る（軽量プレビュー）
  //       const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
  //       const dataUrl = await blobToDataURL(blob);
  //       chrome.runtime.sendMessage({ type: 'FRAME', index, dataUrl, w: vw, h: vh });
  //       last = ts;
  //     }
  //     videoEl.requestVideoFrameCallback(pushFrame);
  //   }

  //   const kick = () => {
  //     chrome.runtime.sendMessage({ type: 'STATUS', text: `capturing #${index} ${videoEl.videoWidth}x${videoEl.videoHeight}` });
  //     videoEl.requestVideoFrameCallback(pushFrame);
  //   };

  //   sessions.set(videoEl, { index, canvas, ctx });
  //   if (videoEl.readyState >= 2) kick();
  //   else videoEl.addEventListener('loadeddata', kick, { once: true });
  // }


  // -----------------------------
  // 瞬き検出（FaceMesh + Worker）
  // -----------------------------
  async function researchMemberBlink(videoEl, index) {
    const SIZE = 224;
    const EAR_THRESHOLD = 0.17;
    const MEASURE_DURATION = 60 * 1000;
    const FPS = 2;

    let blinkCount = 0;
    let lastBlink = false;
    let running = true;
    let processing = false;

    // Canvas生成（OffscreenCanvasはWorker内で使用）
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function createWorker() {
      const url = chrome.runtime.getURL("face_worker.js");
      return new Worker(url, { type: "module" });
    }

    const worker = await createWorker();
    worker.postMessage({ type: "START" });
    

    // Workerからメッセージを受け取る
    worker.onmessage = (e) => {
      const { type, ear, blinkDetected } = e.data;

      if (type === "BLINK_CHECK") {
        if (blinkDetected && !lastBlink) {
          blinkCount++;
          console.log(`瞬き検出: ${blinkCount} 回`);
          chrome.runtime.sendMessage({ type: "BLINK_UPDATE", index, blinkCount });
        }
        lastBlink = blinkDetected;
      }
    };

    const start = Date.now();

    // === メイン処理ループ ===
    async function processFrame() {
      if (!running || !videoEl.isConnected) return;

      if (Date.now() - start >= MEASURE_DURATION) {
        running = false;
        chrome.runtime.sendMessage({ type: "BLINK_RESULT", index, blinkCount });
        console.log(`1分間の瞬き回数 (#${index}): ${blinkCount}`);
        worker.terminate();
        return;
      }

      if (!processing) {
        processing = true;
        try {
          ctx.drawImage(videoEl, 0, 0, SIZE, SIZE);
          const bitmap = await createImageBitmap(canvas);
          worker.postMessage({ type: "FRAME", image: bitmap }, [bitmap]);
        } catch (err) {
          console.warn("Frame processing error:", err);
        }
        processing = false;
      }

      setTimeout(processFrame, 1000 / FPS);
    }

    processFrame();
>>>>>>> Stashed changes:src/content.js
  }


  // video候補を見つけて、候補全部に対して video2img
  function scanAndAttachAll() {
    const vids = findCandidateVideos();
    const memberNum = vids.length
    chrome.runtime.sendMessage({ type: 'VIDEOS_COUNT', count: vids.length });
    // vids.forEach((v, idx) => startOne(v, idx));
    const memberBlinkLst = []
    vids.forEach((v, idx) => researchMemberBlink(v, idx));

  }


  // 処理終わらす
  function stopAll() {
    running = false;
    // WeakMapはforEach不可。参照を外せばGCされる。
    // 動的監視も停止
    if (mo) { mo.disconnect(); mo = null; }
  }

<<<<<<< Updated upstream:extensions/leader/content.js
  function scanAndAttachAll() {
    const vids = findCandidateVideos();
    chrome.runtime.sendMessage({ type: 'VIDEOS_COUNT', count: vids.length });
    vids.forEach((v, idx) => startOne(v, idx));
  }
=======
>>>>>>> Stashed changes:src/content.js

  // 後から入ってきても大丈夫
  function enableDynamicAttach() {
    if (mo) return;
    mo = new MutationObserver(() => { if (running) scanAndAttachAll(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    // 初回
    scanAndAttachAll();
  }


  // 写真をdataに変える
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
      chrome.runtime.sendMessage({ type: 'STATUS', text: 'running…' });
      sendResponse && sendResponse({});
      return true;
    }
    if (msg.cmd === 'STOP') {
      stopAll();
      chrome.runtime.sendMessage({ type: 'STATUS', text: 'stopped' });
      sendResponse && sendResponse({});
      return true;
    }
  });
<<<<<<< Updated upstream:extensions/leader/content.js
})();
=======
})();

>>>>>>> Stashed changes:src/content.js

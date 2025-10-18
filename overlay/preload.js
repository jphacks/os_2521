const { contextBridge, ipcRenderer } = require('electron');

/**
 * レンダラープロセスに安全なAPIを公開
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ページ情報更新イベントを受信
  onUpdatePageInfo: (callback) => {
    ipcRenderer.on('update-page-info', (event, data) => callback(data));
  },

  // 休憩通知表示イベントを受信
  onShowRestNotification: (callback) => {
    ipcRenderer.on('show-rest-notification', (event, data) => callback(data));
  },

  // 休憩通知非表示イベントを受信
  onHideRestNotification: (callback) => {
    ipcRenderer.on('hide-rest-notification', (event) => callback());
  },

  // 通知を非表示にする
  hideNotification: () => {
    ipcRenderer.send('hide-notification');
  }
});

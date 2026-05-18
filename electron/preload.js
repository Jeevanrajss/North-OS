'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, typed API to the renderer (activation window).
// The main app (React) runs at http://127.0.0.1:9847 and doesn't need IPC.
contextBridge.exposeInMainWorld('electronAPI', {
  // Called by activation.html to activate a registration key
  activate: (key) => ipcRenderer.invoke('activate', key),

  // Get the app version
  getVersion: () => ipcRenderer.invoke('get-version'),
});

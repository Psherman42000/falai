import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('falaiAPI', {
  loadConfig: () => ipcRenderer.invoke('config-load'),
  saveConfig: (partial: Record<string, unknown>) => ipcRenderer.invoke('config-save', partial),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  quitApp: () => ipcRenderer.send('app-quit'),
});

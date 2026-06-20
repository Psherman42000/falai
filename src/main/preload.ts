import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('falaiAPI', {
  loadConfig: () => ipcRenderer.invoke('config-load'),
  saveConfig: (partial: Record<string, unknown>) => ipcRenderer.invoke('config-save', partial),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  openSettings: () => ipcRenderer.invoke('notch-open-settings'),
  quitApp: () => ipcRenderer.send('notch-quit'),
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  testMicrophone: (deviceArg: string) => ipcRenderer.invoke('test-microphone', deviceArg),
  onNotchState: (cb: (state: string, message?: string) => void) => {
    const handler = (_event: unknown, data: { state: string; message?: string }) => cb(data.state, data.message);
    ipcRenderer.on('notch-state', handler);
    return () => ipcRenderer.removeListener('notch-state', handler);
  },
});

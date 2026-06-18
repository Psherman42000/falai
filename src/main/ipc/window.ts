import { BrowserWindow, ipcMain } from 'electron';

export function registerWindowIpc(): void {
  ipcMain.on('window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on('window-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.on('app-quit', () => {
    process.exit(0);
  });
}

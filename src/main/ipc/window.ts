import { BrowserWindow, ipcMain } from 'electron';

export function registerWindowIpc(): void {
  ipcMain.on('window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on('window-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.hide();
  });

  ipcMain.on('app-quit', () => {
    process.exit(0);
  });
}

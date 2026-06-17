import { BrowserWindow } from 'electron';
import * as path from 'path';

export class NotchPill {
  private window: BrowserWindow | null = null;

  show(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      return;
    }

    this.window = new BrowserWindow({
      width: 220,
      height: 34,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.window.loadFile(path.join(__dirname, '..', '..', 'notch.html'));
  }

  setState(state: string, message?: string): void {
    this.window?.webContents.send('notch-state', { state, message });
  }

  openSettings(): void {
    // TODO: open settings window.
  }

  hide(): void {
    this.window?.hide();
  }

  dispose(): void {
    this.window?.close();
  }
}

import { BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';

import { ConfigManager } from './config';

const PILL_WIDTH = 260;
const PILL_HEIGHT = 44;
const MARGIN_X = 20;
const MARGIN_Y = 12;

export class NotchPill {
  private window: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;

  constructor(private config: ConfigManager) {
    this.registerIpc();
  }

  private registerIpc(): void {
    ipcMain.handle('notch-open-settings', () => this.openSettings());
    ipcMain.on('notch-quit', () => {
      this.dispose();
      // app.quit() is called via tray.onQuit in main.ts, but this also works:
      import('electron').then(({ app }) => app.quit());
    });
  }

  show(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      return;
    }

    this.window = new BrowserWindow({
      width: PILL_WIDTH,
      height: PILL_HEIGHT,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      focusable: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Don't steal focus from the user's active window
    this.window.setAlwaysOnTop(true, 'floating');
    this.positionWindow();
    this.window.loadFile(path.join(__dirname, '..', '..', 'notch.html'));
    this.window.on('blur', () => {
      // Keep notch visible but return focus to previous window
      this.window?.showInactive();
    });
  }

  setState(state: string, message?: string): void {
    this.window?.webContents.send('notch-state', { state, message });
  }

  openSettings(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.focus();
      return;
    }

    this.settingsWindow = new BrowserWindow({
      width: 600,
      height: 480,
      title: 'Falai — Configurações',
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.settingsWindow.loadFile(path.join(__dirname, '..', '..', 'settings.html'));
    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null;
    });
  }

  hide(): void {
    this.window?.hide();
  }

  isVisible(): boolean {
    return this.window?.isVisible() ?? false;
  }

  dispose(): void {
    this.window?.close();
    this.settingsWindow?.close();
  }

  private positionWindow(): void {
    if (!this.window) return;
    const { workArea } = screen.getPrimaryDisplay();

    // Bottom center
    const x = workArea.x + Math.round((workArea.width - PILL_WIDTH) / 2);
    const y = workArea.y + workArea.height - PILL_HEIGHT - MARGIN_Y;
    this.window.setBounds({ x, y, width: PILL_WIDTH, height: PILL_HEIGHT });
  }
}

import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';

import { ConfigManager, FalaiConfig } from './config';

const PILL_WIDTH = 260;
const PILL_HEIGHT = 44;
const MARGIN_X = 20;
const MARGIN_Y = 12;

export class NotchPill {
  private window: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;

  constructor(private config: ConfigManager) {
    this.registerIpc();
    this.config.on('changed', () => this.positionWindow());
  }

  private registerIpc(): void {
    ipcMain.handle('notch-open-settings', () => {
      this.openSettings();
    });
    ipcMain.on('notch-quit', () => {
      this.dispose();
      app.quit();
    });
  }

  /** Resolve path to an HTML file relative to the app root, works in both dev and packaged mode. */
  private resolveHtml(htmlFile: string): string {
    // app.getAppPath() returns the asar root in production, project root in dev
    return path.join(app.getAppPath(), 'dist', htmlFile);
  }

  show(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.showInactive();
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
      focusable: false,
      show: false, // Don't show until positioned
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.positionWindow();
    this.window.loadFile(this.resolveHtml('notch.html'))
      .then(() => {
        this.window?.showInactive();
      })
      .catch((err) => {
        console.error('[notch-pill] Failed to load notch.html:', err);
        console.error('[notch-pill] Tried path:', this.resolveHtml('notch.html'));
      });

    this.window.on('blur', () => {
      // Window lost activation but should stay visible & on top
      // No action needed — show: false + showInactive handles the rest
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

    this.settingsWindow.loadFile(this.resolveHtml('settings.html'))
      .catch((err) => {
        console.error('[notch-pill] Failed to load settings.html:', err);
      });
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
    const { notchPosition } = this.config.get();

    let x: number;
    switch (notchPosition) {
      case 'top-left':
      case 'bottom-left':
        x = workArea.x + MARGIN_X;
        break;
      case 'top-right':
      case 'bottom-right':
        x = workArea.x + workArea.width - PILL_WIDTH - MARGIN_X;
        break;
      case 'top-center':
      case 'bottom-center':
      default:
        x = workArea.x + Math.round((workArea.width - PILL_WIDTH) / 2);
        break;
    }

    const isBottom = notchPosition?.startsWith('bottom');
    const y = isBottom
      ? workArea.y + workArea.height - PILL_HEIGHT - MARGIN_Y
      : workArea.y + MARGIN_Y;

    this.window.setBounds({ x, y, width: PILL_WIDTH, height: PILL_HEIGHT });
  }
}

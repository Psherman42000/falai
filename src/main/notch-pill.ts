import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

import { ConfigManager, FalaiConfig } from './config';

const PILL_WIDTH = 220;
const PILL_HEIGHT = 34;
const MARGIN_X = 20;
const MARGIN_Y = 12;

export class NotchPill {
  private window: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;

  constructor(private config: ConfigManager) {}

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
      focusable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.window.setIgnoreMouseEvents(true);
    this.positionWindow();
    this.window.loadFile(path.join(__dirname, '..', '..', 'notch.html'));
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
      width: 560,
      height: 420,
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
    const { notchPosition } = this.config.get();
    const { workArea } = screen.getPrimaryDisplay();

    let x: number;
    switch (notchPosition) {
      case 'top-left':
        x = workArea.x + MARGIN_X;
        break;
      case 'top-right':
        x = workArea.x + workArea.width - PILL_WIDTH - MARGIN_X;
        break;
      case 'top-center':
      default:
        x = workArea.x + Math.round((workArea.width - PILL_WIDTH) / 2);
        break;
    }

    const y = workArea.y + MARGIN_Y;
    this.window.setBounds({ x, y, width: PILL_WIDTH, height: PILL_HEIGHT });
  }
}

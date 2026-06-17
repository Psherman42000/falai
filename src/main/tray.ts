import { Menu, Tray, nativeImage } from 'electron';
import * as path from 'path';

export class TrayManager {
  private tray: Tray | null = null;
  onOpenSettings: (() => void) | null = null;
  onToggleStealth: (() => void) | null = null;
  onQuit: (() => void) | null = null;
  private isStealth = false;

  constructor() {
    const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon_16.png');
    const icon = nativeImage.createFromPath(iconPath);
    this.tray = new Tray(icon);
    this.tray.setToolTip('FALAI — segure Ctrl+Space para falar');
    this.updateMenu();
  }

  private updateMenu(): void {
    if (!this.tray) return;
    const stealthLabel = this.isStealth ? 'Mostrar notch' : 'Modo stealth';
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Configurações', click: () => this.onOpenSettings?.() },
        { label: stealthLabel, click: () => this.toggleStealth() },
        { type: 'separator' },
        { label: 'Sair', click: () => this.onQuit?.() },
      ])
    );
  }

  private toggleStealth(): void {
    this.isStealth = !this.isStealth;
    this.onToggleStealth?.();
    this.updateMenu();
  }

  setTooltip(tip: string): void {
    this.tray?.setToolTip(tip);
  }
}

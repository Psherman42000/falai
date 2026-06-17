import { Menu, Tray, nativeImage } from 'electron';

export class TrayManager {
  private tray: Tray | null = null;
  onOpenSettings: (() => void) | null = null;
  onQuit: (() => void) | null = null;

  constructor() {
    this.tray = new Tray(nativeImage.createEmpty());
    this.tray.setToolTip('FALAI');
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Configurações', click: () => this.onOpenSettings?.() },
        { type: 'separator' },
        { label: 'Sair', click: () => this.onQuit?.() },
      ])
    );
  }
}

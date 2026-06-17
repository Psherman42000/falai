import { ipcMain } from 'electron';
import { ConfigManager } from '../config';

export function registerConfigIpc(config: ConfigManager): void {
  ipcMain.handle('config-load', () => config.get());
  ipcMain.handle('config-save', (_event, partial) => config.save(partial));
}

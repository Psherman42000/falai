import * as fs from 'fs';

import { ipcMain } from 'electron';
import { ConfigManager } from '../config';

export function registerConfigIpc(config: ConfigManager): void {
  ipcMain.handle('config-load', () => {
    return config.get();
  });

  ipcMain.handle('config-save', async (_event, partial) => {
    return config.save(partial);
  });
}

import * as fs from 'fs';
import * as path from 'path';

import { ipcMain } from 'electron';
import { ConfigManager } from '../config';

export function registerConfigIpc(config: ConfigManager): void {
  ipcMain.handle('config-load', () => {
    const cfg = config.get();
    console.log('[config-ipc] LOAD from memory:', JSON.stringify(cfg));

    // Debug: also read from disk to check persistence
    try {
      // Access configPath via the config manager
      const configPath = (config as any).configPath;
      if (configPath) {
        const raw = fs.readFileSync(configPath as string, 'utf-8');
        console.log('[config-ipc] LOAD from disk:', raw.trim());
      }
    } catch {
      console.log('[config-ipc] No config file on disk yet');
    }

    return cfg;
  });

  ipcMain.handle('config-save', async (_event, partial) => {
    console.log('[config-ipc] SAVE partial:', JSON.stringify(partial));
    try {
      const cfg = await config.save(partial);
      console.log('[config-ipc] SAVE result (memory):', JSON.stringify(cfg));

      // Debug: verify disk matches
      try {
        const configPath = (config as any).configPath;
        if (configPath) {
          const raw = fs.readFileSync(configPath as string, 'utf-8');
          console.log('[config-ipc] SAVE disk after write:', raw.trim());
        }
      } catch (e: any) {
        console.log('[config-ipc] SAVE disk read error:', e.message);
      }

      return cfg;
    } catch (err) {
      console.error('[config-ipc] SAVE error:', err);
      throw err;
    }
  });
}

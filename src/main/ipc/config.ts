import { ipcMain } from 'electron';
import { ConfigManager } from '../config';

export function registerConfigIpc(config: ConfigManager): void {
  ipcMain.handle('config-load', () => {
    const cfg = config.get();
    console.log('[config-ipc] load:', JSON.stringify(cfg));
    return cfg;
  });

  ipcMain.handle('config-save', async (_event, partial) => {
    console.log('[config-ipc] save partial:', JSON.stringify(partial));
    try {
      const cfg = await config.save(partial);
      console.log('[config-ipc] save result:', JSON.stringify(cfg));
      return cfg;
    } catch (err) {
      console.error('[config-ipc] save error:', err);
      throw err;
    }
  });
}

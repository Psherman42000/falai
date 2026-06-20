import { execSync } from 'child_process';
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

  ipcMain.handle('get-audio-devices', async () => {
    try {
      const result = execSync(
        'python -c "import sounddevice as sd; import json; devs=sd.query_devices(); print(json.dumps([{\'index\':i,\'name\':d[\'name\'],\'channels\':d[\'max_input_channels\'],\'sr\':int(d[\'default_samplerate\']) if d[\'default_samplerate\'] else 0} for i,d in enumerate(devs) if d[\'max_input_channels\']>0]))"',
        { timeout: 10000, encoding: 'utf-8' }
      );
      return JSON.parse(result.trim());
    } catch (err) {
      console.error('[config-ipc] Failed to list audio devices:', err);
      return [];
    }
  });

  ipcMain.handle('test-microphone', async (_event, deviceArg: string) => {
    try {
      const pyCode = deviceArg
        ? `import sounddevice as sd, numpy as np, json; rec=sd.rec(int(16000), 16000, 1, dtype=np.float32${deviceArg}); sd.wait(); ns=int(np.sum(np.abs(rec)>0.01)); print(json.dumps({'ok':True,'samples':len(rec),'nonSilence':ns,'max':float(np.max(np.abs(rec)))}))`
        : `import sounddevice as sd, numpy as np, json; rec=sd.rec(int(16000), 16000, 1, dtype=np.float32); sd.wait(); ns=int(np.sum(np.abs(rec)>0.01)); print(json.dumps({'ok':True,'samples':len(rec),'nonSilence':ns,'max':float(np.max(np.abs(rec)))}))`;
      const result = execSync(`python -c "${pyCode.replace(/"/g, '\\"')}"`, { timeout: 15000, encoding: 'utf-8' });
      return JSON.parse(result.trim());
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}

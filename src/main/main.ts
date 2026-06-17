import { app } from 'electron';

import { ConfigManager } from './config';
import { FalaiPipeline } from './pipeline';
import { HotkeyManager } from './hotkey-manager';
import { NotchPill } from './notch-pill';
import { TrayManager } from './tray';
import { VoicePipeline } from './voice-pipeline';
import { TextInjector } from './text-injector';
import { registerConfigIpc, registerWindowIpc } from './ipc';

let pipeline: FalaiPipeline | null = null;

async function bootstrap(): Promise<void> {
  const config = new ConfigManager();
  await config.load();

  registerConfigIpc(config);
  registerWindowIpc();

  const notch = new NotchPill(config);
  const tray = new TrayManager();
  const hotkey = new HotkeyManager(config);
  const voice = new VoicePipeline(config);
  const injector = new TextInjector();

  pipeline = new FalaiPipeline({
    config,
    notch,
    hotkey,
    voice,
    injector,
  });

  tray.onOpenSettings = () => notch.openSettings();
  tray.onQuit = () => app.quit();

  await pipeline.start();
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // Keep running in tray.
});

app.on('before-quit', () => {
  pipeline?.stop();
});

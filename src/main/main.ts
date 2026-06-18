import { app, dialog } from 'electron';

import { ConfigManager } from './config';
import { FalaiPipeline } from './pipeline';
import { HotkeyManager } from './hotkey-manager';
import { NotchPill } from './notch-pill';
import { TrayManager } from './tray';
import { VoicePipeline } from './voice-pipeline';
import { TextInjector } from './text-injector';
import { registerConfigIpc, registerWindowIpc } from './ipc';

let pipeline: FalaiPipeline | null = null;

// Prevent multiple instances (avoids duplicate workers & electron processes)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  // User tried to open another instance — focus the existing one
  const { BrowserWindow } = require('electron');
  const wins = BrowserWindow.getAllWindows();
  if (wins.length > 0) {
    wins[0].show();
    wins[0].focus();
  }
});

async function bootstrap(): Promise<void> {
  try {
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
    tray.onToggleStealth = () => {
      if (notch.isVisible?.()) {
        notch.hide();
      } else {
        notch.show();
      }
    };
    tray.onQuit = () => app.quit();

    await pipeline.start();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[main] Bootstrap failed:', err);
    dialog.showErrorBox(
      'FALAI — Erro ao iniciar',
      `${message}\n\n` +
      'Verifique:\n' +
      '1. Antivírus não está bloqueando o whisper_worker.exe\n' +
      '2. Execute como Administrador (necessário para atalho global)\n' +
      '3. Se o erro persistir, desative o antivírus temporariamente'
    );
    app.quit();
  }
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // Keep running in tray.
});

app.on('before-quit', () => {
  pipeline?.stop();
});

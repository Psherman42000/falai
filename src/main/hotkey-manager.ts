import { execSync } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

import { ConfigManager } from './config';
import { WorkerProcess } from './worker-process';

interface HotkeyMessage {
  event: string;
  combo?: string[];
  message?: string;
}

/**
 * Resolve o Python do venv local (workers/venv) se existir,
 * senão tenta python → py → python3 do sistema.
 */
function resolvePython(): string {
  const venvPython = path.join(__dirname, '..', '..', 'workers', 'venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  const candidates = ['python', 'py', 'python3'];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore', timeout: 5000 });
      return cmd;
    } catch {
      // tenta próximo
    }
  }
  return 'python'; // fallback final
}

export class HotkeyManager extends EventEmitter {
  private worker: WorkerProcess;
  private pythonCmd: string;

  constructor(private config: ConfigManager) {
    super();
    this.pythonCmd = resolvePython();
    const script = path.join(__dirname, '..', '..', 'workers', 'hotkey_worker.py');
    const combo = this.config.get().hotkey;
    console.log(`[hotkey-manager] Python: ${this.pythonCmd} | Script: ${script} | Combo: ${combo}`);
    this.worker = new WorkerProcess({
      command: this.pythonCmd,
      args: [script, combo],
      env: { PYTHONIOENCODING: 'utf-8' },
      label: 'hotkey',
    });
    this.worker.on('message', (msg: HotkeyMessage) => this.handleMessage(msg));
    this.worker.on('error', (err: Error) => this.emit('error', err));
  }

  async start(): Promise<boolean> {
    return this.worker.start();
  }

  dispose(): void {
    this.worker.dispose();
  }

  private handleMessage(msg: HotkeyMessage): void {
    if (msg.event === 'hotkey_pressed') {
      this.emit('pressed');
      return;
    }
    if (msg.event === 'hotkey_released') {
      this.emit('released');
      return;
    }
    if (msg.event === 'error' && msg.message) {
      this.emit('error', new Error(msg.message));
    }
  }
}

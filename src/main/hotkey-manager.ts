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

interface WorkerResolved {
  command: string;
  args: string[];
}

function resolveHotkeyWorker(): WorkerResolved {
  // Production: extraResources copies workers/ to resources/workers/
  if (process.resourcesPath) {
    const exePath = path.join(process.resourcesPath, 'workers', 'hotkey_worker.exe');
    if (fs.existsSync(exePath)) {
      return { command: exePath, args: [] };
    }
  }

  // Dev: use venv python + script
  const venvPython = path.join(__dirname, '..', '..', 'workers', 'venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) {
    const script = path.join(__dirname, '..', '..', 'workers', 'hotkey_worker.py');
    return { command: venvPython, args: [script] };
  }

  // Fallback: system python + script
  for (const cmd of ['python', 'py', 'python3']) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore', timeout: 5000 });
      const script = path.join(__dirname, '..', '..', 'workers', 'hotkey_worker.py');
      return { command: cmd, args: [script] };
    } catch { /* next */ }
  }

  const script = path.join(__dirname, '..', '..', 'workers', 'hotkey_worker.py');
  return { command: 'python', args: [script] };
}

export class HotkeyManager extends EventEmitter {
  private worker: WorkerProcess;

  constructor(private config: ConfigManager) {
    super();
    const combo = this.config.get().hotkey;
    const resolved = resolveHotkeyWorker();
    // Pass combo as first arg for both .exe and python script
    resolved.args.push(combo);
    console.log(`[hotkey-manager] Command: ${resolved.command} | Args: ${resolved.args.join(' ')} | Combo: ${combo}`);
    this.worker = new WorkerProcess({
      command: resolved.command,
      args: resolved.args,
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

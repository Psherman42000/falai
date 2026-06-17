import { EventEmitter } from 'events';
import * as path from 'path';

import { ConfigManager } from './config';
import { WorkerProcess } from './worker-process';

interface HotkeyMessage {
  event: string;
  combo?: string[];
  message?: string;
}

export class HotkeyManager extends EventEmitter {
  private worker: WorkerProcess;

  constructor(private config: ConfigManager) {
    super();
    const script = path.join(__dirname, '..', '..', 'workers', 'hotkey_worker.py');
    const combo = this.config.get().hotkey;
    this.worker = new WorkerProcess({
      command: 'python',
      args: [script, combo],
      env: { PYTHONIOENCODING: 'utf-8' },
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

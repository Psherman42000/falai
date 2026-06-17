import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';

import { ConfigManager } from './config';
import { WorkerProcess } from './worker-process';

export class VoicePipeline extends EventEmitter {
  private worker: WorkerProcess;

  constructor(private config: ConfigManager) {
    super();
    const script = path.join(__dirname, '..', '..', 'workers', 'whisper_worker.py');
    this.worker = new WorkerProcess({
      command: 'python',
      args: [script],
    });
  }

  async start(): Promise<boolean> {
    return this.worker.start();
  }

  startRecording(): void {
    this.worker.send({ cmd: 'start_recording' });
  }

  stopRecording(): void {
    this.worker.send({ cmd: 'stop_recording' });
  }

  dispose(): void {
    this.worker.dispose();
  }
}

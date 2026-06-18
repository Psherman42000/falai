import { execSync } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

import { ConfigManager } from './config';
import { WorkerProcess } from './worker-process';

interface WhisperMessage {
  event: string;
  text?: string;
  language?: string;
  duration?: number;
  status?: string;
  model?: string;
  message?: string;
}

function resolvePython(): string {
  const venvPython = path.join(__dirname, '..', '..', 'workers', 'venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  for (const cmd of ['python', 'py', 'python3']) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore', timeout: 5000 });
      return cmd;
    } catch { /* next */ }
  }
  return 'python';
}

export class VoicePipeline extends EventEmitter {
  private worker: WorkerProcess;
  private started = false;

  constructor(private config: ConfigManager) {
    super();
    const pythonCmd = resolvePython();
    const script = path.join(__dirname, '..', '..', 'workers', 'whisper_worker.py');
    console.log(`[voice-pipeline] Python: ${pythonCmd} | Script: ${script}`);
    this.worker = new WorkerProcess({
      command: pythonCmd,
      args: [script],
      env: { PYTHONIOENCODING: 'utf-8' },
      label: 'voice',
    });
    this.worker.on('message', (msg: WhisperMessage) => this.handleMessage(msg));
    this.worker.on('error', (err: Error) => this.emit('error', err));
  }

  async start(): Promise<boolean> {
    if (this.started) return true;
    const ready = await this.worker.start();
    if (!ready) return false;

    this.worker.send({
      cmd: 'load_model',
      model: this.config.get().whisperModel,
    });
    this.started = true;
    return true;
  }

  startRecording(): void {
    const lang = this.config.get().language;
    this.worker.send({
      cmd: 'start_recording',
      language: lang === 'auto' ? null : lang,
    });
  }

  stopRecording(): void {
    this.worker.send({ cmd: 'stop_recording' });
  }

  dispose(): void {
    this.worker.dispose();
    this.started = false;
  }

  private handleMessage(msg: WhisperMessage): void {
    if (msg.event === 'transcription' && msg.text !== undefined) {
      this.emit('transcription', msg.text);
      return;
    }
    if (msg.event === 'error' && msg.message) {
      this.emit('error', new Error(msg.message));
      return;
    }
    if (msg.event === 'status' && msg.status) {
      this.emit('status', msg.status);
    }
  }
}

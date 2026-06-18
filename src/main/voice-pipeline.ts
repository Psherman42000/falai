import { execSync } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

import { ConfigManager, FalaiConfig } from './config';
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

interface WorkerResolved {
  command: string;
  args: string[];
}

function resolveWhisperWorker(): WorkerResolved {
  // Production: extraResources copies dist/workers/ to resources/workers/
  // PyInstaller --onedir creates subdirectory with .exe + .dll/.pyd files
  if (process.resourcesPath) {
    const exePath = path.join(process.resourcesPath, 'workers', 'whisper_worker', 'whisper_worker.exe');
    if (fs.existsSync(exePath)) {
      return { command: exePath, args: [] };
    }
  }

  // Dev: use venv python + script
  const venvPython = path.join(__dirname, '..', '..', 'workers', 'venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) {
    const script = path.join(__dirname, '..', '..', 'workers', 'whisper_worker.py');
    return { command: venvPython, args: [script] };
  }

  // Fallback: system python + script
  for (const cmd of ['python', 'py', 'python3']) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore', timeout: 5000 });
      const script = path.join(__dirname, '..', '..', 'workers', 'whisper_worker.py');
      return { command: cmd, args: [script] };
    } catch { /* next */ }
  }

  const script = path.join(__dirname, '..', '..', 'workers', 'whisper_worker.py');
  return { command: 'python', args: [script] };
}

export class VoicePipeline extends EventEmitter {
  private worker: WorkerProcess;
  private started = false;
  private currentModel: string | null = null;

  constructor(private config: ConfigManager) {
    super();
    const resolved = resolveWhisperWorker();
    console.log(`[voice-pipeline] Command: ${resolved.command} | Args: ${resolved.args.join(' ')}`);
    this.worker = new WorkerProcess({
      command: resolved.command,
      args: resolved.args,
      env: { PYTHONIOENCODING: 'utf-8' },
      label: 'voice',
    });
    this.worker.on('message', (msg: WhisperMessage) => this.handleMessage(msg));
    this.worker.on('error', (err: Error) => this.emit('error', err));

    this.config.on('changed', (cfg: FalaiConfig) => this.onConfigChanged(cfg));
  }

  private onConfigChanged(cfg: FalaiConfig): void {
    if (cfg.whisperModel && cfg.whisperModel !== this.currentModel) {
      this.worker.send({ cmd: 'load_model', model: cfg.whisperModel });
    }
  }

  async start(): Promise<boolean> {
    if (this.started) return true;
    const ready = await this.worker.start();
    if (!ready) return false;

    const modelName = this.config.get().whisperModel;
    this.currentModel = modelName;
    this.worker.send({ cmd: 'load_model', model: modelName });
    this.started = true;
    return true;
  }

  startRecording(): void {
    const cfg = this.config.get();
    this.worker.send({
      cmd: 'start_recording',
      language: cfg.language === 'auto' ? null : cfg.language,
      format_text: cfg.formatText,
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
    if (msg.event === 'status' && msg.status === 'model_loaded' && msg.model) {
      this.currentModel = msg.model;
      this.emit('status', msg.status);
      return;
    }
    if (msg.event === 'status' && msg.status) {
      this.emit('status', msg.status);
    }
  }
}

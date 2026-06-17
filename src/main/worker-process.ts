import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { EventEmitter } from 'events';

interface WorkerOptions {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

export class WorkerProcess extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';

  constructor(private options: WorkerOptions) {
    super();
  }

  start(): Promise<boolean> {
    if (this.process) return Promise.resolve(true);

    return new Promise((resolve) => {
      try {
        this.process = spawn(this.options.command, this.options.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this.options.env },
        });
        this.setupStdoutParser();
        this.setupErrorHandler(resolve);
        this.waitForReady(resolve);
      } catch {
        resolve(false);
      }
    });
  }

  send(message: Record<string, unknown>): void {
    if (!this.process?.stdin.writable) return;
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  dispose(): void {
    this.send({ cmd: 'shutdown' });
    setTimeout(() => this.kill(), 2000);
  }

  private kill(): void {
    if (!this.process) return;
    this.process.kill('SIGTERM');
    this.process = null;
  }

  private setupStdoutParser(): void {
    this.process?.stdout.on('data', (data: Buffer) => {
      this.buffer += data.toString('utf-8');
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          this.handleMessage(JSON.parse(line));
        } catch {
          console.warn('[worker] invalid JSON:', line);
        }
      }
    });
  }

  private setupErrorHandler(resolve: (v: boolean) => void): void {
    this.process?.on('error', () => resolve(false));
    this.process?.on('exit', (code) => {
      if (code !== 0) this.emit('error', new Error(`Worker exited with code ${code}`));
    });
  }

  private waitForReady(resolve: (v: boolean) => void): void {
    const timeout = setTimeout(() => resolve(false), 10000);
    const onReady = (msg: Record<string, unknown>) => {
      if (msg.event !== 'ready') return;
      clearTimeout(timeout);
      this.off('message', onReady);
      resolve(true);
    };
    this.on('message', onReady);
  }

  private handleMessage(message: Record<string, unknown>): void {
    this.emit('message', message);
    const event = String(message.event ?? '');
    if (event === 'error') {
      this.emit('error', new Error(String(message.message ?? 'Worker error')));
      return;
    }
    this.emit(event, message);
  }
}

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { EventEmitter } from 'events';

interface WorkerOptions {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  label?: string;
}

export class WorkerProcess extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private stderrBuffer = '';
  private label: string;

  constructor(private options: WorkerOptions) {
    super();
    this.label = options.label ?? 'worker';
  }

  start(): Promise<boolean> {
    if (this.process) return Promise.resolve(true);

    const tag = `[${this.label}]`;
    return new Promise((resolve) => {
      try {
        this.process = spawn(this.options.command, this.options.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this.options.env },
        });
        this.setupStdoutParser();
        this.setupStderrCapture();
        this.setupErrorHandler(resolve);
        this.waitForReady(resolve);
      } catch (err) {
        console.error(`${tag} spawn failed:`, err);
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
          console.warn(`[${this.label}] invalid JSON:`, line);
        }
      }
    });
  }

  private setupStderrCapture(): void {
    this.process?.stderr.on('data', (data: Buffer) => {
      const text = data.toString('utf-8').trim();
      if (text) {
        this.stderrBuffer += text + '\n';
        console.error(`[${this.label}] stderr:`, text);
      }
    });
  }

  private setupErrorHandler(resolve: (v: boolean) => void): void {
    this.process?.on('error', (err: Error) => {
      console.error(`[${this.label}] spawn error:`, err.message);
      this.emit('error', new Error(`Falha ao iniciar ${this.label}: ${err.message}`));
      resolve(false);
    });
    this.process?.on('exit', (code) => {
      if (code !== 0) {
        const detail = this.stderrBuffer.trim() || `exit code ${code}`;
        this.emit('error', new Error(`${this.label} encerrou com erro: ${detail}`));
      }
    });
  }

  private waitForReady(resolve: (v: boolean) => void): void {
    const timeout = setTimeout(() => {
      const detail = this.stderrBuffer.trim();
      const msg = detail
        ? `${this.label} não respondeu (stderr: ${detail})`
        : `${this.label} não respondeu em 60s — verifique se o antivírus não está bloqueando`;
      console.error(`[${this.label}] ${msg}`);
      this.emit('error', new Error(msg));
      resolve(false);
    }, 60000);
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

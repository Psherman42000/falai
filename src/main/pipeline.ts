import { EventEmitter } from 'events';

import { ConfigManager } from './config';
import { HotkeyManager } from './hotkey-manager';
import { NotchPill } from './notch-pill';
import { TextInjector } from './text-injector';
import { VoicePipeline } from './voice-pipeline';

interface PipelineDeps {
  config: ConfigManager;
  notch: NotchPill;
  hotkey: HotkeyManager;
  voice: VoicePipeline;
  injector: TextInjector;
}

export class FalaiPipeline extends EventEmitter {
  private isRunning = false;

  constructor(private deps: PipelineDeps) {
    super();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    this.deps.notch.show();

    const voiceReady = await this.deps.voice.start();
    if (!voiceReady) {
      throw new Error('Falha ao iniciar pipeline de voz');
    }

    const hotkeyReady = await this.deps.hotkey.start();
    if (!hotkeyReady) {
      throw new Error('Falha ao iniciar hook de hotkey');
    }

    this.deps.hotkey.on('pressed', () => this.onPressed());
    this.deps.hotkey.on('released', () => this.onReleased());
    this.deps.voice.on('transcription', (text: string) => this.onTranscription(text));
    this.deps.voice.on('error', (err: Error) => this.onError(err));
    this.deps.hotkey.on('error', (err: Error) => this.onError(err));
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.deps.hotkey.dispose();
    this.deps.voice.dispose();
    this.deps.notch.dispose();
  }

  private onPressed(): void {
    this.deps.notch.setState('listening');
    this.deps.voice.startRecording();
  }

  private onReleased(): void {
    this.deps.notch.setState('processing');
    this.deps.voice.stopRecording();
  }

  private async onTranscription(text: string): Promise<void> {
    this.deps.notch.setState('typing', text);
    await this.deps.injector.typeText(text);
    setTimeout(() => this.deps.notch.setState('idle'), 2000);
  }

  private onError(err: Error): void {
    this.deps.notch.setState('error', err.message);
  }
}

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

    // 1. Inicia pipeline de voz (whisper worker)
    const voiceReady = await this.deps.voice.start();
    if (!voiceReady) {
      throw new Error(
        'Falha ao iniciar pipeline de voz.\n' +
        'Verifique: python --version && pip install faster-whisper sounddevice numpy'
      );
    }

    // 2. Inicia hook de hotkey (pynput worker)
    const hotkeyReady = await this.deps.hotkey.start();
    if (!hotkeyReady) {
      throw new Error(
        'Falha ao iniciar hook de hotkey.\n' +
        'Verifique: pip install pynput\n' +
        'Se estiver no Windows, execute como Administrador.'
      );
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
    this.deps.injector.captureForegroundWindow();
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
    console.error('[pipeline] Error:', err.message);
    this.deps.notch.setState('error', err.message);
  }
}

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
  constructor(private deps: PipelineDeps) {
    super();
  }

  async start(): Promise<void> {
    this.deps.notch.show();
    await this.deps.voice.start();
    this.deps.hotkey.register(this.deps.config.get().hotkey);

    this.deps.hotkey.on('start-listening', () => this.onStartListening());
    this.deps.hotkey.on('stop-listening', () => this.onStopListening());
    this.deps.voice.on('transcription', (text: string) => this.onTranscription(text));
    this.deps.voice.on('error', (err: Error) => this.onError(err));
  }

  stop(): void {
    this.deps.hotkey.unregister();
    this.deps.voice.dispose();
    this.deps.notch.dispose();
  }

  private onStartListening(): void {
    this.deps.notch.setState('listening');
    this.deps.voice.startRecording();
  }

  private onStopListening(): void {
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

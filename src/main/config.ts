import { app } from 'electron';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

import { WhisperModelName } from './whisper-models';

export interface FalaiConfig {
  language: 'auto' | string;
  whisperModel: WhisperModelName;
  hotkey: string;
  notchPosition: 'top-center' | 'top-left' | 'top-right' | 'bottom-center' | 'bottom-left' | 'bottom-right';
  formatText: boolean;
  microphoneDevice: string;
}

const DEFAULTS: FalaiConfig = {
  language: 'auto',
  whisperModel: 'base',
  hotkey: 'Ctrl+Space',
  notchPosition: 'bottom-center',
  formatText: true,
  microphoneDevice: 'default',
};

export class ConfigManager extends EventEmitter {
  private config: FalaiConfig = { ...DEFAULTS };

  private get configPath(): string {
    return path.join(app.getPath('appData'), 'Falai', 'config.json');
  }

  async load(): Promise<FalaiConfig> {
    try {
      const raw = await fs.promises.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<FalaiConfig>;
      this.config = { ...DEFAULTS, ...parsed };
    } catch {
      this.config = { ...DEFAULTS };
    }
    return this.config;
  }

  async save(partial: Partial<FalaiConfig>): Promise<FalaiConfig> {
    this.config = { ...this.config, ...partial };
    const dir = path.dirname(this.configPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
    this.emit('changed', this.config);
    return this.config;
  }

  get(): FalaiConfig {
    return { ...this.config };
  }
}

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface FalaiConfig {
  language: 'auto' | string;
  whisperModel: 'tiny' | 'base' | 'small' | 'medium';
  hotkey: string;
  notchPosition: 'top-center' | 'top-left' | 'top-right';
}

const DEFAULTS: FalaiConfig = {
  language: 'auto',
  whisperModel: 'base',
  hotkey: 'Ctrl+Space',
  notchPosition: 'top-center',
};

export class ConfigManager {
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
    return this.config;
  }

  get(): FalaiConfig {
    return { ...this.config };
  }
}

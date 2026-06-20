export interface FalaiWindowAPI {
  loadConfig: () => Promise<Record<string, unknown>>;
  saveConfig: (partial: Record<string, unknown>) => Promise<Record<string, unknown>>;
  minimizeWindow: () => void;
  closeWindow: () => void;
  quitApp: () => void;
  getAudioDevices: () => Promise<Array<{index: number; name: string; channels: number; sr: number}>>;
  testMicrophone: (deviceArg: string) => Promise<{ok: boolean; samples?: number; nonSilence?: number; max?: number; error?: string}>;
  onNotchState: (cb: (state: string, message?: string) => void) => () => void;
}

declare global {
  interface Window {
    falaiAPI: FalaiWindowAPI;
  }
}

export {};

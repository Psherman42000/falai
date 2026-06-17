export interface FalaiWindowAPI {
  loadConfig: () => Promise<Record<string, unknown>>;
  saveConfig: (partial: Record<string, unknown>) => Promise<Record<string, unknown>>;
  minimizeWindow: () => void;
  closeWindow: () => void;
  quitApp: () => void;
}

declare global {
  interface Window {
    falaiAPI: FalaiWindowAPI;
  }
}

export {};

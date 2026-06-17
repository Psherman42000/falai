import { globalShortcut } from 'electron';
import { EventEmitter } from 'events';

export class HotkeyManager extends EventEmitter {
  private active = false;

  register(accelerator = 'Ctrl+Space'): boolean {
    if (!globalShortcut.isRegistered(accelerator)) {
      globalShortcut.register(accelerator, () => this.toggle(true));
    }

    // Release detection: globalShortcut doesn't emit release, so we poll.
    // FALAI uses a Python global hook for hold-to-talk; this is a stub.
    return globalShortcut.isRegistered(accelerator);
  }

  toggle(hold: boolean): void {
    if (hold === this.active) return;
    this.active = hold;
    this.emit(hold ? 'start-listening' : 'stop-listening');
  }

  unregister(): void {
    globalShortcut.unregisterAll();
  }
}

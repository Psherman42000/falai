import * as koffi from 'koffi';

const INPUT_KEYBOARD = 1;
const KEYEVENTF_UNICODE = 0x0004;
const KEYEVENTF_KEYUP = 0x0002;

export class TextInjector {
  private user32: koffi.IKoffiLib | null = null;
  private SendInput: koffi.KoffiFunction | null = null;
  private GetForegroundWindow: koffi.KoffiFunction | null = null;
  private SetForegroundWindow: koffi.KoffiFunction | null = null;
  private Input: koffi.IKoffiCType | null = null;
  private lastForegroundWindow: bigint = BigInt(0);

  constructor() {
    try {
      this.user32 = koffi.load('user32.dll');

      const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
        wVk: koffi.types.uint16,
        wScan: koffi.types.uint16,
        dwFlags: koffi.types.uint32,
        time: koffi.types.uint32,
        dwExtraInfo: koffi.types.uint64,
      });

      const UNION = koffi.union('UNION', {
        ki: KEYBDINPUT,
        mi: koffi.struct('MOUSEINPUT', {
          dx: koffi.types.int32,
          dy: koffi.types.int32,
          mouseData: koffi.types.uint32,
          dwFlags: koffi.types.uint32,
          time: koffi.types.uint32,
          dwExtraInfo: koffi.types.uint64,
        }),
        hi: koffi.struct('HARDWAREINPUT', {
          uMsg: koffi.types.uint32,
          wParamL: koffi.types.uint16,
          wParamH: koffi.types.uint16,
        }),
      });

      this.Input = koffi.struct('INPUT', {
        type: koffi.types.uint32,
        union: UNION,
      });

      this.SendInput = this.user32.func('uint32 SendInput(uint32 cInputs, _In_ INPUT *pInputs, int cbSize)');
      this.GetForegroundWindow = this.user32.func('uint64 __stdcall GetForegroundWindow()');
      this.SetForegroundWindow = this.user32.func('bool __stdcall SetForegroundWindow(uint64 hWnd)');

      const size = koffi.sizeof(this.Input);
      const expectedSize = process.arch === 'x64' ? 40 : 28;
      if (size !== expectedSize) {
        console.warn(`[TextInjector] Tamanho inesperado de INPUT: ${size} bytes (esperado ${expectedSize} no ${process.arch})`);
      } else {
        console.log(`[TextInjector] SendInput carregado — INPUT size: ${size} bytes (${process.arch})`);
      }
    } catch (err) {
      console.error('[TextInjector] Falha ao carregar user32.dll:', err);
    }
  }

  /** Guarda a janela atualmente em foreground. Chamar no 'pressed' do hotkey. */
  captureForegroundWindow(): void {
    if (!this.GetForegroundWindow) return;
    try {
      this.lastForegroundWindow = this.GetForegroundWindow() as bigint;
      console.log(`[TextInjector] Foreground window capturado: 0x${this.lastForegroundWindow.toString(16)}`);
    } catch (err) {
      console.warn('[TextInjector] Falha ao capturar foreground window:', err);
    }
  }

  async typeText(text: string): Promise<void> {
    if (!this.SendInput || !this.Input) {
      console.warn('[TextInjector] SendInput indisponível; texto não injetado:', text);
      return;
    }

    // Restaura a janela que estava em foreground antes do hotkey
    if (this.lastForegroundWindow && this.SetForegroundWindow) {
      try {
        const restored = this.SetForegroundWindow(this.lastForegroundWindow);
        console.log(`[TextInjector] SetForegroundWindow: ${restored}`);
        // Pequena pausa pro Windows trocar o foco
        await this.delay(50);
      } catch (err) {
        console.warn('[TextInjector] Falha ao restaurar foreground:', err);
      }
    }

    const inputs = this.buildInputs(text);
    if (inputs.length === 0) return;

    const cbSize = koffi.sizeof(this.Input);

    // SendInput aceita array; enviamos em lotes para não estourar pilha.
    const BATCH = 32;
    for (let i = 0; i < inputs.length; i += BATCH) {
      const batch = inputs.slice(i, i + BATCH);
      const sent = this.SendInput(batch.length, batch, cbSize);
      if (sent !== batch.length) {
        console.warn(`[TextInjector] SendInput enviou ${sent}/${batch.length} eventos`);
      }
      // Pequena pausa para não perder eventos em aplicações lentas.
      await this.delay(1);
    }
  }

  private buildInputs(text: string): unknown[] {
    const inputs: unknown[] = [];
    for (const char of text) {
      const code = char.codePointAt(0) ?? 0;
      if (code < 0x20 || code === 0x7f) {
        // Pula caracteres de controle; espaço (0x20) é válido.
        continue;
      }
      const scan = code & 0xffff;
      inputs.push(this.makeKeyInput(scan, KEYEVENTF_UNICODE));
      inputs.push(this.makeKeyInput(scan, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
    }
    return inputs;
  }

  private makeKeyInput(scan: number, flags: number): unknown {
    return {
      type: INPUT_KEYBOARD,
      union: {
        ki: {
          wVk: 0,
          wScan: scan,
          dwFlags: flags,
          time: 0,
          dwExtraInfo: BigInt(0),
        },
      },
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

import * as koffi from 'koffi';

const INPUT_KEYBOARD = 1;
const KEYEVENTF_UNICODE = 0x0004;
const KEYEVENTF_KEYUP = 0x0002;

interface KeyboardInput {
  wVk: number;
  wScan: number;
  dwFlags: number;
  time: number;
  dwExtraInfo: bigint;
}

interface InputUnion {
  ki: KeyboardInput;
}

interface Input {
  type: number;
  union: InputUnion;
}

export class TextInjector {
  private user32: koffi.IKoffiLib | null = null;
  private SendInput: koffi.KoffiFunction | null = null;
  private Input: koffi.IKoffiCType | null = null;

  constructor() {
    try {
      this.user32 = koffi.load('user32.dll');

      this.Input = koffi.struct('INPUT', {
        type: 'uint32',
        union: koffi.union('UNION', {
          ki: koffi.struct('KEYBDINPUT', {
            wVk: 'uint16',
            wScan: 'uint16',
            dwFlags: 'uint32',
            time: 'uint32',
            dwExtraInfo: 'uint64',
          }),
        }),
      });

      this.SendInput = this.user32.func('uint32 SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)');
    } catch (err) {
      console.error('[TextInjector] Falha ao carregar user32.dll:', err);
    }
  }

  async typeText(text: string): Promise<void> {
    if (!this.SendInput || !this.Input) {
      console.warn('[TextInjector] SendInput indisponível; texto não injetado:', text);
      return;
    }

    const inputs = this.buildInputs(text);
    if (inputs.length === 0) return;

    // SendInput aceita array; enviamos em lotes para não estourar pilha.
    const BATCH = 32;
    for (let i = 0; i < inputs.length; i += BATCH) {
      const batch = inputs.slice(i, i + BATCH);
      this.SendInput(batch.length, batch, koffi.sizeof(this.Input));
      // Pequena pausa para não perder eventos em aplicações lentas.
      await this.delay(1);
    }
  }

  private buildInputs(text: string): Input[] {
    const inputs: Input[] = [];
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

  private makeKeyInput(scan: number, flags: number): Input {
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

---
name: falai-electron-python-worker
title: FALAI — Electron + Python Workers (Hotkey, Whisper, SendInput)
description: Padrão de integração Electron + Python workers via spawn, com foco em hotkey global (pynput), STT (faster-whisper), e injeção de texto via SendInput Win32.
trigger: Quando trabalhar no projeto FALAI ou em apps Electron que spawnam Python workers para hotkey global, transcrição de voz, ou injeção de texto no Windows.
---

# FALAI — Electron + Python Workers

## Visão

App Electron que usa workers Python para:
- **Hotkey global** (`pynput`) — hook de teclado hold-to-talk
- **STT** (`faster-whisper` + `sounddevice`) — transcrição de voz local
- **Injeção de texto** (`SendInput` Win32 via `koffi`) — digita texto no cursor ativo

## Estrutura de Workers

```
workers/
├── hotkey_worker.py      # pynput hook global → stdout JSON
├── whisper_worker.py     # faster-whisper + sounddevice → stdout JSON
├── requirements.txt      # dependências Python
└── venv/                 # virtualenv (CRIAR OBRIGATORIAMENTE)
    └── Scripts/
        └── python.exe    # ← usar ESTE, não o python global
```

## Regra Crítica: Usar Python do venv

**NUNCA** usar `python`/`py`/`python3` do PATH. Sempre priorizar o venv:

```typescript
// src/main/hotkey-manager.ts  e  src/main/voice-pipeline.ts
import * as fs from 'fs';

function resolvePython(): string {
  const venvPython = path.join(__dirname, '..', '..', 'workers', 'venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  // fallback global só se venv não existir
  for (const cmd of ['python', 'py', 'python3']) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore', timeout: 5000 });
      return cmd;
    } catch { /* next */ }
  }
  return 'python';
}
```

**Erro típico:** `ModuleNotFoundError: No module named 'pynput'` — worker usando Python global em vez do venv.

## TextInjector — SendInput Win32

### Estrutura INPUT correta (koffi)

```typescript
const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
  wVk: koffi.types.uint16,
  wScan: koffi.types.uint16,
  dwFlags: koffi.types.uint32,
  time: koffi.types.uint32,
  dwExtraInfo: koffi.types.uint64,
});

const UNION = koffi.union('UNION', {
  ki: KEYBDINPUT,
  mi: koffi.struct('MOUSEINPUT', { /* ... */ }),
  hi: koffi.struct('HARDWAREINPUT', { /* ... */ }),
});

const INPUT = koffi.struct('INPUT', {
  type: koffi.types.uint32,
  union: UNION,
});

// sizeof no x64 = 40 bytes; no x86 = 28 bytes
```

**NUNCA usar `koffi.pack()`** — compacta sem padding, quebra alinhamento do Windows.

### Foco da janela (foreground)

Problema: `SendInput` envia pro thread em foreground. Se o app Electron roubar o foco, o texto vai pro lugar errado.

Solução: capturar a janela foreground no `hotkey_pressed` e restaurar antes de digitar:

```typescript
class TextInjector {
  private lastForegroundWindow: bigint = BigInt(0);

  captureForegroundWindow(): void {
    const GetForegroundWindow = user32.func('uint64 __stdcall GetForegroundWindow()');
    this.lastForegroundWindow = GetForegroundWindow() as bigint;
  }

  async typeText(text: string): Promise<void> {
    // Restaura a janela que estava ativa antes do hotkey
    const SetForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(uint64 hWnd)');
    SetForegroundWindow(this.lastForegroundWindow);
    await this.delay(50); // aguarda o Windows trocar o foco

    // ... envia SendInput
  }
}
```

No pipeline:
```typescript
private onPressed(): void {
  this.deps.injector.captureForegroundWindow();  // ← CAPTURAR AQUI
  this.deps.notch.setState('listening');
  this.deps.voice.startRecording();
}
```

## WorkerProcess — Spawn de Python

```typescript
export class WorkerProcess extends EventEmitter {
  constructor(options: {
    command: string;      // ← python do venv
    args: string[];        // [scriptPath, ...]
    env?: NodeJS.ProcessEnv;
    label?: string;
  }) {}
}
```

Protocolo: stdin/stdout JSON-line (newline-delimited JSON).

## Troubleshooting

| Problema | Causa | Solução |
|----------|-------|---------|
| `ModuleNotFoundError: No module named 'pynput'` | Worker usando Python global | `resolvePython()` deve retornar `venv/Scripts/python.exe` |
| Texto aparece no pill em vez de digitar no cursor | Foco perdido para o Electron | `captureForegroundWindow()` no `onPressed` + `SetForegroundWindow()` antes de `SendInput` |
| `sizeof INPUT` = 24 (errado) | Usou `koffi.pack()` | Usar `koffi.struct()` com union completa (mi, ki, hi) |
| `SendInput` retorna 0 | `cbSize` incorreto ou janela sem foco | Verificar `koffi.sizeof(INPUT)` = 40 (x64) / 28 (x86) |

## Comandos

```bash
# Criar venv
cd workers
python -m venv venv
venv\Scripts\pip install -r requirements.txt

# Build
cd ..
npm run build

# Testar SendInput isolado
node -e "const koffi=require('koffi'); /* ... testar INPUT size ... */"
```

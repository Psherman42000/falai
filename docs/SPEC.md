# FALAI — Especificação Técnica

> App desktop Windows: segura Ctrl+Space, fala, solta — texto aparece no cursor.

## 1. Visão

FALAI é um ditador por voz universal. Funciona em qualquer campo de texto do Windows porque injeta caracteres via `SendInput` Win32, sem precisar de integração por aplicativo.

## 2. Princípios (Clean Code)

- **SRP:** cada módulo faz uma coisa. `VoicePipeline` só transcreve. `TextInjector` só digita. `HotkeyManager` só gerencia atalho.
- **DRY:** reaproveita `WorkerProcess`, notch pill, tray e padrões do Mimico.
- **Boundaries:** Whisper e Win32 são externos, isolados por adapters (`voice-pipeline.ts`, `text-injector.ts`).
- **Error handling:** `safeAsync()` centralizado; erros não viram strings mágicas.
- **Config-driven:** idioma e modelo Whisper são config, não constantes no código.

## 3. Arquitetura

```
falai/
├── src/main/
│   ├── main.ts              → Entry point, lifecycle
│   ├── pipeline.ts          → FalaiPipeline (orquestra hold→record→transcribe→type)
│   ├── worker-process.ts    → WorkerProcess base class (spawn, stdin/stdout JSON, lifecycle)
│   ├── hotkey-manager.ts    → Ctrl+Space global shortcut, estados hold/release
│   ├── voice-pipeline.ts    → Audio → Whisper → Text (SRP: só transcreve)
│   ├── text-injector.ts     → SendInput Win32 (SRP: só digita)
│   ├── notch-pill.ts        → Pill overlay (idle/listening/processing/typing/error)
│   ├── config.ts            → Idioma, modelo Whisper, hotkey
│   ├── tray.ts              → Bandeja sistema
│   ├── error-handler.ts     → safeAsync, toError
│   └── ipc/
│       ├── config.ts        → handlers load/save config
│       └── window.ts        → handlers de janela (minimize, close, quit)
├── workers/
│   └── whisper_worker.py    → faster-whisper, stdin/stdout JSON
├── notch.html               → Pill visual
├── settings.html            → Janela de config
├── preload.ts               → Context bridge
├── package.json
├── tsconfig.json
└── electron-builder.yml
```

## 4. Fluxo Principal

```
Ctrl+Space (hold)
    │
    ▼
hotkey-manager → emite 'start-listening'
    │
    ▼
notch-pill → estado LISTENING (vermelho, 🎙️)
    │
    ▼
voice-pipeline → grava áudio do mic via Python worker
    │
    ▼
Ctrl+Space (solta)
    │
    ▼
hotkey-manager → emite 'stop-listening'
    │
    ▼
notch-pill → estado PROCESSING (amarelo, ⏳)
    │
    ▼
voice-pipeline → envia áudio → whisper_worker.py
    │
    ▼
whisper_worker → retorna texto transcrito
    │
    ▼
text-injector → SendInput(texto) no cursor atual
    │
    ▼
notch-pill → estado TYPING (verde, ✓) → volta IDLE após 2s
```

## 5. Módulos

### 5.1 main.ts
- Inicializa app Electron.
- Cria `TrayManager`, `NotchPill`, `HotkeyManager`, `FalaiPipeline`.
- Não orquestra lógica de negócio — delega para `FalaiPipeline`.

### 5.2 FalaiPipeline
- Único ponto de coordenação entre hotkey, gravação, transcrição e digitação.
- Métodos pequenos: `onHoldStart()`, `onHoldEnd()`, `onTranscription(text)`, `onError(err)`.

### 5.3 HotkeyManager
- Registra atalho global `Ctrl+Space` via `globalShortcut`.
- Emite eventos `start-listening` / `stop-listening` (EventEmitter).
- Não sabe o que acontece depois.

### 5.4 VoicePipeline
- Estende `WorkerProcess` para gerenciar `whisper_worker.py`.
- Envia comando `start_recording` / `stop_recording` via stdin JSON.
- Recebe eventos `audio_chunk`, `transcription`, `error`.
- Mantém modelo carregado na memória (warm).

### 5.5 TextInjector
- `typeText(text: string): Promise<void>`.
- Usa `SendInput` via `koffi` ou `ffi-napi`.
- Suporta Unicode (acentos, emoji) usando `INPUT_KEYBOARD` com `KEYEVENTF_UNICODE`.

### 5.6 NotchPill
- BrowserWindow transparente, always-on-top, skip-taskbar, WS_EX_TOOLWINDOW.
- Estados: `idle`, `listening`, `processing`, `typing`, `error`.
- Expande/colapsa como no Mimico.

### 5.7 Config
- Local: `%APPDATA%/Falai/config.json`.
- Schema:
  ```json
  {
    "language": "auto",
    "whisperModel": "base",
    "hotkey": "Ctrl+Space",
    "notchPosition": "top-center"
  }
  ```

## 6. Idioma

- Saída no idioma falado (transcrição pura).
- `language: "auto"` usa detecção automática do faster-whisper.
- `language: "pt"` força português, etc.
- Tradução é feature futura, fora do escopo inicial.

## 7. Estados do Pill

| Estado | Cor | Ícone | Comportamento |
|--------|-----|-------|---------------|
| IDLE | Cinza | Falai | Pill colapsado (200x34px) |
| LISTENING | Vermelho | 🎙️ | Pulsando, mostra tempo |
| PROCESSING | Amarelo | ⏳ | Spinner |
| TYPING | Verde | ✓ | Mostra texto por 2s |
| ERROR | Vermelho escuro | ✗ | Mensagem por 3s |

## 8. Fases de Implementação

- **F1 — Foundation:** repo, estrutura base, tsconfig, package.json, build sem erro.
- **F2 — WorkerProcess + Whisper Worker:** copiar/adaptar `worker-process.ts` e `whisper_worker.py` do Mimico.
- **F3 — Hotkey + VoicePipeline:** gravação hold-to-talk.
- **F4 — TextInjector:** SendInput Win32.
- **F5 — NotchPill:** overlay com 5 estados.
- **F6 — Config + Settings:** idioma, modelo, hotkey.
- **F7 — Polish + Build:** tray, stealth mode, instalador NSIS.

## 9. Dependências

### Node
- `electron` 33
- `typescript`
- `koffi` (Win32 API)
- `electron-builder`

### Python
- `faster-whisper`
- `sounddevice`
- `numpy`

## 10. Decisões Pendentes

1. **Captura de áudio:** usar `sounddevice` direto no worker Python (mais simples) ou manter captura separada no main? Decisão: captura no worker Python (`sounddevice`), main apenas envia comandos via stdin.
2. **Hotkey customizável:** fase F6. Inicialmente fixo em `Ctrl+Space`.
3. **Win32 lib:** `koffi` (recomendado, sem rebuild nativo) vs `ffi-napi` (usado no Mimico). Decisão inicial: `koffi` se funcionar no ambiente; senão `ffi-napi`.

## 11. Referências

- Mimico (`C:\Users\user\Desktop\Mimico`) — WorkerProcess, notch, tray, config.
- Skill `electron-windows-apps` — padrões Electron + Win32.
- Skill `clean-code` — SRP, DRY, funções pequenas, boundaries.

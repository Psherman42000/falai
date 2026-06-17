# FALAI — Dictação por Voz Universal para Windows

Segure **Ctrl+Space**, fale, solte → texto digitado no cursor.

## Pré-requisitos

- Windows 10 ou 11 (64-bit)
- **Python 3.10+** instalado e no PATH
- **Node.js 18+** instalado

## Setup rápido

```bash
# 1. Clone
git clone https://github.com/Psherman42000/falai.git
cd falai

# 2. Dependências Node
npm install

# 3. Dependências Python
pip install -r workers/requirements.txt

# 4. Build + rodar
npm start
```

O instalador NSIS também pode ser gerado:

```bash
npm run dist:win
```

O setup .exe sai em `release/FALAI-Setup-0.1.0.exe`.

## Como usar

1. Inicie o FALAI (ícone na bandeja do Windows)
2. Um pill roxo aparece no topo da tela
3. **Segure Ctrl+Space**, fale, solte
4. A transcrição aparece digitada no cursor

## Configurações

Clique com botão direito no ícone da bandeja → "Configurações".
Ajustes disponíveis:

- **Modelo Whisper**: tiny (rápido) | base (padrão) | small | medium
- **Idioma**: auto-detect | português | inglês | espanhol | francês
- **Posição do notch**: topo centro | esquerda | direita
- **Modo stealth**: oculta o pill

## Estrutura

```
falai/
├── src/main/          # Electron + TypeScript
│   ├── main.ts        # Bootstrap
│   ├── pipeline.ts    # Orquestrador
│   ├── config.ts      # ConfigManager
│   ├── voice-pipeline.ts  # Speech-to-text
│   ├── hotkey-manager.ts  # Hotkey worker
│   ├── text-injector.ts   # SendInput Win32
│   ├── notch-pill.ts      # Overlay pill
│   ├── worker-process.ts  # Base para workers Python
│   └── tray.ts            # Bandeja do sistema
├── workers/           # Workers Python
│   ├── whisper_worker.py  # Transcrição (faster-whisper + sounddevice)
│   └── hotkey_worker.py   # Hook global (pynput)
├── assets/            # Ícones
├── docs/
│   ├── SPEC.md        # Especificação técnica
│   └── DESIGN.md      # Sistema visual
├── release/           # Instalador (gitignored)
└── notch.html         # UI do pill
```

## Tecnologias

- **Electron 33** — shell desktop
- **koffi** — chamadas Win32 (SendInput)
- **faster-whisper** — STT local (CPU, int8)
- **sounddevice** — captura microfone
- **pynput** — hook global de teclado
- **electron-builder** — instalador NSIS

## Roadmap

- [x] F1: docs + fundação TypeScript
- [x] F2: whisper worker + pipeline de voz
- [x] F3: hotkey global hold-to-talk
- [x] F4: TextInjector SendInput Unicode
- [x] F5: NotchPill + settings window
- [x] F6: settings funcional
- [x] F7: tray, stealth, instalador

Feito com ❤️ por Pedro

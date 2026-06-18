# FALAI — Dictação por Voz Universal para Windows

Segure **Ctrl+Space**, fale, solta → texto digitado no cursor.

Funciona em **qualquer** campo de texto do Windows (Word, Chrome, VS Code, terminal...) sem integração por app.

## Download e Instalação

1. Baixe o **`FALAI-Setup-1.2.0.exe`** na [página de releases](https://github.com/Psherman42000/falai/releases)
2. Execute o instalador
3. Pronto — não precisa de Python nem Node.js instalados

O instalador cria atalhos na Área de Trabalho e no Menu Iniciar.

---

## Como usar

1. Inicie o FALAI (ícone aparece na bandeja do Windows)
2. Um pill flutuante aparece **na parte inferior central** da tela
3. **Segure Ctrl+Space**, fale normalmente, **solte**
4. A transcrição é digitada automaticamente no cursor

### Notch interativo

Passe o mouse sobre o pill para ver os botões:
- ⚙️ **Configurações** — abre a janela de settings
- ✕ **Fechar** — encerra o app

### Estados do pill

| Estado | Cor | O que acontece |
|--------|-----|----------------|
| IDLE | Cinza | Pronto, aguardando |
| LISTENING | Vermelho | Gravando áudio (waveform animado + timer) |
| PROCESSING | Amarelo | Transcrevendo (spinner) |
| TYPING | Verde | Texto digitado |
| ERROR | Vermelho escuro | Erro |

### Configurações

| Config | Opções | Padrão |
|--------|--------|--------|
| Modelo Whisper | tiny, base, small, medium, large, large-v3 | base |
| Idioma | auto-detect, PT, EN, ES, FR | auto |
| Formatação | Ativada/Desativada (capitaliza, pontua) | Ativada |
| Hotkey | Ctrl+Space (fixo por enquanto) | Ctrl+Space |

Config salva em: `%APPDATA%/Falai/config.json`

---

## Features v1.2

- **Modelo Whisper hot-reload** — troca de modelo nas configurações sem reiniciar o app. Modelo anterior é descarregado da RAM.
- **Formatação de texto** — capitalização automática, pontuação, normalização de espaços (com toggle ligado/desligado).
- **Áudio longo (5min+)** — chunking automático de 25s com 2s overlap evita truncamento.
- **Notch redesenhado** — pill na parte inferior, glassmorphism, waveform animado, botões de settings/quit no hover.
- **Instalador standalone** — não requer Python nem Node.js no PC destino (workers empacotados com PyInstaller).

---

## Para desenvolvedores

### Pré-requisitos (desenvolvimento)

| Requisito | Versão | Verificar |
|-----------|--------|-----------|
| Windows | 10/11 64-bit | `winver` |
| Python | 3.10+ | `python --version` |
| Node.js | 18+ LTS | `node --version` |
| Git | qualquer | `git --version` |

### Setup

```bash
git clone https://github.com/Psherman42000/falai.git
cd falai
npm install

# Criar venv Python para os workers
cd workers
python -m venv venv
venv/Scripts/pip install -r requirements.txt pyinstaller
cd ..
```

### Executar em modo dev

```bash
npm start
```

### Gerar instalador

```bash
npm run dist:win
```

Isso executa:
1. `tsc` — compila TypeScript
2. `build-workers.sh` — empacota workers Python como `.exe` standalone (PyInstaller)
3. `electron-builder` — gera `release/FALAI-Setup-1.2.0.exe`

O instalador pode ser distribuído livremente — não precisa de Python nem Node.js na máquina destino.

---

## Estrutura do projeto

```
falai/
├── src/main/                    # Electron + TypeScript
│   ├── main.ts                  # Bootstrap do app
│   ├── pipeline.ts               # Orquestrador (hold → record → transcribe → type)
│   ├── config.ts                 # ConfigManager + FalaiConfig
│   ├── whisper-models.ts        # Fonte única de modelos Whisper (DRY)
│   ├── voice-pipeline.ts        # STT — detecta .exe empacotado ou venv
│   ├── hotkey-manager.ts        # Hotkey global hold-to-talk
│   ├── text-injector.ts          # SendInput Win32
│   ├── notch-pill.ts             # Overlay pill (bottom-center, clicável)
│   ├── worker-process.ts         # Base para workers (spawn, JSON lines)
│   ├── tray.ts                   # Bandeja do sistema
│   └── ipc/                      # Handlers IPC
├── workers/                      # Workers Python
│   ├── whisper_worker.py         # faster-whisper + chunking + formatação
│   ├── hotkey_worker.py          # pynput hook global
│   └── requirements.txt
├── scripts/
│   ├── build-workers.sh          # PyInstaller → .exe standalone
│   └── copy-assets.js            # Copia HTML/assets para dist/
├── assets/                       # Ícones (.ico, .png)
├── docs/
│   ├── SPEC.md                   # Especificação técnica
│   ├── DESIGN.md                 # Sistema visual
│   └── falai-model-formatting-5min.md  # Plano de implementação v1.2
├── notch.html                    # UI do notch overlay
├── settings.html                 # Janela de configurações
└── package.json
```

---

## Tecnologias

- **Electron 33** — shell desktop
- **TypeScript 5** — tipagem estática
- **koffi** — chamadas Win32 (SendInput)
- **faster-whisper** — STT local (CPU, int8)
- **sounddevice** — captura de microfone
- **pynput** — hook global de teclado
- **PyInstaller** — empacotamento de workers Python como .exe
- **electron-builder** — instalador NSIS

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Pill não aparece | Verifique se outro app está capturando Ctrl+Space |
| Áudio não grava | Verifique permissões de microfone no Windows |
| Texto não aparece no cursor | Execute como administrador |
| Erro ao carregar modelo | Tente modelo menor (base ou tiny) |
| `ModuleNotFoundError` em dev | Recrie o venv: `cd workers && python -m venv venv && venv/Scripts/pip install -r requirements.txt` |

---

## Roadmap

- [x] F1: Docs + fundação TypeScript
- [x] F2: Whisper worker + pipeline de voz
- [x] F3: Hotkey global hold-to-talk
- [x] F4: TextInjector SendInput Unicode
- [x] F5: NotchPill + settings window
- [x] F6: Settings funcional
- [x] F7: Hot-reload de modelo + formatação + notch redesenhado
- [x] F8: Instalador standalone (PyInstaller + electron-builder)
- [ ] F9: LLM local para correção de palavras

---

Feito com ❤️ por Pedro



Olá, tudo bom? Como é que você está por aí? Isso é só um teste, tá?
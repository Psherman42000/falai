# FALAI — Dictação por Voz Universal para Windows

Segure **Ctrl+Space**, fale, solte → texto digitado no cursor.

Funciona em **qualquer** campo de texto do Windows (Word, Chrome, VS Code, terminal...) sem integração por app.

---

## Pré-requisitos

| Requisito | Versão mínima | Verificar |
|-----------|---------------|-----------|
| Windows | 10 ou 11 (64-bit) | `winver` |
| Python | 3.10+ | `python --version` |
| Node.js | 18+ LTS | `node --version` |
| Git | qualquer | `git --version` |

> **Se `python` não é reconhecido:** instale via [python.org](https://www.python.org/downloads/) e marque **"Add Python to PATH"** no instalador.
>
> **Se `node` não é reconhecido:** instale via [nodejs.org](https://nodejs.org/) (versão LTS).

---

## Setup do zero (Windows)

### 1. Clone o repositório

```bash
git clone https://github.com/Psherman42000/falai.git
cd falai
```

### 2. Instale dependências Node

```bash
npm install
```

### 3. Crie virtualenv Python (recomendado)

```bash
cd workers
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

> **Por que virtualenv?** Isola as dependências Python do projeto. Para reativar depois: `cd workers && venv\Scripts\activate`.

### 4. Compile e execute

```bash
npm start
```

Isso compila o TypeScript e abre o app Electron.

### 5. Gerar instalador (opcional)

```bash
npm run dist:win
```

O setup `.exe` é gerado em `release/FALAI-Setup-0.1.0.exe` e pode ser distribuído — não precisa de Node/Python na máquina destino.

---

## Como usar

1. Inicie o FALAI (ícone aparece na bandeja do Windows)
2. Um pill aparece no topo da tela
3. **Segure Ctrl+Space**, fale normalmente, **solte**
4. A transcrição é digitada automaticamente no cursor

### Estados do pill

| Estado | Cor | O que acontece |
|--------|-----|----------------|
| IDLE | Cinza | Pronto, aguardando |
| LISTENING | Vermelho | Gravando áudio |
| PROCESSING | Amarelo | Transcrevendo (Whisper) |
| TYPING | Verde | Digitando texto |
| ERROR | Vermelho escuro | Algo deu errado |

---

## Configurações

Clique com botão direito no ícone da bandeja → **Configurações**.

| Config | Opções | Padrão |
|--------|--------|--------|
| Modelo Whisper | tiny, base, small, medium | base |
| Idioma | auto-detect, PT, EN, ES, FR | auto |
| Hotkey | Ctrl+Space (fixo por enquanto) | Ctrl+Space |
| Posição do pill | topo centro, esquerda, direita | topo centro |
| Modo stealth | oculta o pill | desligado |

Config salva em: `%APPDATA%/Falai/config.json`

---

## Estrutura do projeto

```
falai/
├── src/main/              # Electron + TypeScript
│   ├── main.ts            # Bootstrap do app
│   ├── pipeline.ts        # Orquestrador (hold → record → transcribe → type)
│   ├── config.ts          # ConfigManager
│   ├── voice-pipeline.ts  # Speech-to-text (SRP: só transcreve)
│   ├── hotkey-manager.ts  # Hotkey global hold-to-talk
│   ├── text-injector.ts   # SendInput Win32 (SRP: só digita)
│   ├── notch-pill.ts      # Overlay pill com 5 estados
│   ├── worker-process.ts  # Base para workers Python
│   ├── error-handler.ts   # safeAsync, tratamento de erros
│   └── tray.ts            # Bandeja do sistema
├── src/shared/
│   └── types.ts           # Tipos compartilhados
├── workers/               # Workers Python
│   ├── whisper_worker.py  # faster-whisper + sounddevice
│   ├── hotkey_worker.py   # Hook global (pynput)
│   └── requirements.txt   # Dependências Python
├── assets/                # Ícones (.ico, .png)
├── docs/
│   ├── SPEC.md            # Especificação técnica completa
│   └── DESIGN.md          # Sistema visual, tokens, paleta
├── dist/                  # JS compilado (gerado)
├── release/               # Instalador (gerado)
└── notch.html             # UI do pill overlay
```

---

## Tecnologias

- **Electron 33** — shell desktop
- **TypeScript 5** — tipagem estática
- **koffi** — chamadas Win32 (SendInput)
- **faster-whisper** — STT local (CPU, int8)
- **sounddevice** — captura de microfone
- **pynput** — hook global de teclado
- **electron-builder** — instalador NSIS

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| `python não é reconhecido` | Reinstale Python com "Add to PATH" marcado |
| `pip` não instala `faster-whisper` | Use Python 3.10+, verifique se o venv está ativo |
| `koffi` falha no `npm install` | Feche e reabra o terminal como administrador |
| Pill não aparece | Verifique se outro app está capturando Ctrl+Space |
| Áudio não grava | Verifique se o microfone está habilitado no Windows |
| Erro de SendInput | Execute como administrador |
| `electron-builder` falha | Delete `node_modules` e faça `npm install` novamente |

---

## Roadmap

- [x] F1: Docs + fundação TypeScript
- [x] F2: Whisper worker + pipeline de voz
- [x] F3: Hotkey global hold-to-talk
- [x] F4: TextInjector SendInput Unicode
- [x] F5: NotchPill + settings window
- [x] F6: Settings funcional
- [x] F7: Tray, stealth, instalador

---

Feito com ❤️ por Pedro

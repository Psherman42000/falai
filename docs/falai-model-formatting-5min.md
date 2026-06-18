# FALAI — Melhorias: Seletor de Modelo + Formatação + 5min Áudio

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Permitir troca de modelo Whisper em runtime, adicionar formatação/correção do texto transcrito, e garantir funcionamento para áudio de até 5 minutos.

**Architecture:** 
- **Modelo:** Config-driven com hot-reload via EventEmitter (`config.on('changed')` → `voice-pipeline.ts` envia `load_model` pro worker). Worker descarrega modelo anterior da RAM antes de carregar novo.
- **Formatação:** Pipeline de pós-processamento no worker Python — capitalização, pontuação, normalização de espaços. Opcional: LLM local (GGUF) para correção de palavras futuramente.
- **5min áudio:** Chunking já implementado (25s/2s overlap). Apenas garantir que não há timeout no pipeline.

**Tech Stack:** Electron + TypeScript (main), Python + faster-whisper (worker), JSON lines stdin/stdout protocol.

---

## Clean Code — Princípios Aplicados

Este plano segue os princípios de Clean Code (Robert C. Martin):

| Princípio | Aplicação |
|-----------|-----------|
| **SRP (Ch3, Ch10)** | `format_transcription()` faz só formatação. `load_model()` faz só carregamento. `VoicePipeline` só transcreve. |
| **Funções pequenas (Ch3)** | `format_transcription()` quebrada em sub-funções: `_normalize_spaces()`, `_capitalize_sentences()`, `_ensure_terminal_punctuation()`. Cada uma 3-5 linhas. |
| **DRY (Ch12)** | `whisperModelOptions` centralizado num único local (data-driven), não duplicado entre config.ts e settings.html. |
| **Error handling (Ch7)** | Worker usa try/catch com contexto específico. `load_model` não retorna bool — lança exceção em falha. |
| **Boundaries (Ch8)** | Protocolo JSON é boundaryLanguage entre TS e Python. Tipos fortes de mensagem em ambos os lados. |
| **No comments lies (Ch4)** | Código se explica — comentários só onde há decisão não-óbvia (ex: por que `condition_on_previous_text=False`). |
| **YAGNI (Ch12)** | Não implementar LLM local agora — só o pipeline de formatação com regex. LLM é feature futura. |

---

## Contexto do Código Atual

### Arquitetura existente (F1-F6 implementados)

```
falai/
├── src/main/
│   ├── config.ts              → ConfigManager (FalaiConfig: language, whisperModel, hotkey, notchPosition)
│   ├── voice-pipeline.ts      → VoicePipeline: spawn whisper_worker.py, envia comandos JSON
│   ├── worker-process.ts      → WorkerProcess base class (spawn, stdin/stdout JSON, lifecycle)
│   ├── hotkey-manager.ts      → HotkeyManager: Ctrl+Space global shortcut
│   ├── pipeline.ts            → FalaiPipeline: orquestra hold→record→transcribe→type
│   └── (outros módulos: text-injector, notch-pill, tray, etc.)
├── workers/
│   └── whisper_worker.py      → faster-whisper, chunking 25s/2s overlap, stdin/stdout JSON
├── notch.html                 → Pill overlay (idle/listening/processing/typing/error)
├── settings.html              → Janela de config (já tem select whisperModel)
└── docs/SPEC.md, docs/DESIGN.md
```

### Protocolo JSON Worker ↔ Main

**Comandos (main → worker):**
```json
{"cmd": "load_model", "model": "base"}
{"cmd": "start_recording", "language": "pt", "format_text": true}
{"cmd": "stop_recording"}
{"cmd": "shutdown"}
```

**Eventos (worker → main):**
```json
{"event": "status", "status": "model_loaded", "model": "base"}
{"event": "status", "status": "listening"}
{"event": "status", "status": "processing"}
{"event": "transcription", "text": "...", "language": "pt", "duration": 30.5}
{"event": "error", "message": "..."}
```

### Config atual (`src/main/config.ts`)

```typescript
export interface FalaiConfig {
  language: 'auto' | string;
  whisperModel: 'tiny' | 'base' | 'small' | 'medium';
  hotkey: string;
  notchPosition: 'top-center' | 'top-left' | 'top-right';
}
```

**Problema:** `voice-pipeline.ts` lê config no `start()`, mas não reage a mudanças. Se usuário muda modelo nas settings, precisa reiniciar o app.

### Worker atual (`workers/whisper_worker.py`)

- `load_model()` já existe e funciona
- `SUPPORTED_MODELS = {"tiny", "base", "small", "medium", "large", "large-v2", "large-v3"}`
- Chunking implementado: 25s chunks, 2s overlap, `condition_on_previous_text=False`
- **Falta:** descarregar modelo anterior da RAM, formatação do texto

---

## Tarefas

### Task 1: Centralizar opções de modelo Whisper (DRY)

**Objective:** Evitar duplicação (DRY — Ch12). Criar uma fonte única de verdade para modelos suportados, usada tanto pela config TypeScript quanto pela UI HTML.

**Files:**
- Create: `src/main/whisper-models.ts`
- Modify: `src/main/config.ts:6-8`
- Modify: `settings.html:158-168`

**Step 1: Criar arquivo com modelos suportados**

```typescript
// src/main/whisper-models.ts

export type WhisperModelName = 'tiny' | 'base' | 'small' | 'medium' | 'large' | 'large-v3';

export interface WhisperModelOption {
  value: WhisperModelName;
  label: string;
  hint: string;
}

export const WHISPER_MODELS: WhisperModelOption[] = [
  { value: 'tiny',     label: 'tiny',     hint: '39 MB, rápido, menos preciso' },
  { value: 'base',     label: 'base',     hint: '74 MB, equilíbrio (padrão)' },
  { value: 'small',    label: 'small',    hint: '244 MB, mais preciso' },
  { value: 'medium',   label: 'medium',   hint: '769 MB, melhor, mais lento' },
  { value: 'large',    label: 'large',    hint: '1.5 GB, alta qualidade' },
  { value: 'large-v3', label: 'large-v3', hint: '2.9 GB, melhor qualidade' },
];
```

**Step 2: Atualizar config.ts para usar o tipo centralizado**

```typescript
// src/main/config.ts, linha 6-8
import { WhisperModelName } from './whisper-models';

export interface FalaiConfig {
  language: 'auto' | string;
  whisperModel: WhisperModelName;
  hotkey: string;
  notchPosition: 'top-center' | 'top-left' | 'top-right';
  formatText: boolean;
}
```

**Step 3: Renderizar options dinamicamente no settings.html**

```html
<!-- settings.html, substituir o <select id="whisperModel"> estático -->
<div class="field">
  <label>Modelo Whisper</label>
  <select id="whisperModel"></select>
  <div class="hint" id="whisperModelHint"></div>
</div>

<div class="field">
  <label>Formatação automática</label>
  <select id="formatText">
    <option value="true">Ativada — capitaliza, pontua, normaliza espaços</option>
    <option value="false">Desativada — texto cru do Whisper</option>
  </select>
  <div class="hint">Desative se preferir transcrição literal sem alterações.</div>
</div>
```

```javascript
// settings.html, no script — popular select dinamicamente
const WHISPER_MODELS = [
  { value: 'tiny',     label: 'tiny',     hint: '39 MB, rápido, menos preciso' },
  { value: 'base',     label: 'base',     hint: '74 MB, equilíbrio (padrão)' },
  { value: 'small',    label: 'small',    hint: '244 MB, mais preciso' },
  { value: 'medium',   label: 'medium',   hint: '769 MB, melhor, mais lento' },
  { value: 'large',    label: 'large',    hint: '1.5 GB, alta qualidade' },
  { value: 'large-v3', label: 'large-v3', hint: '2.9 GB, melhor qualidade' },
];

const whisperSelect = document.getElementById('whisperModel');
const whisperHint = document.getElementById('whisperModelHint');

WHISPER_MODELS.forEach(m => {
  const opt = document.createElement('option');
  opt.value = m.value;
  opt.textContent = `${m.label} — ${m.hint}`;
  whisperSelect.appendChild(opt);
});

whisperSelect.addEventListener('change', () => {
  const selected = WHISPER_MODELS.find(m => m.value === whisperSelect.value);
  whisperHint.textContent = selected?.hint || '';
});
```

> **Nota DRY:** O array é duplicado entre TS e HTML porque o renderer não tem acesso aos módulos do main process. A alternativa seria expor via IPC, mas isso adiciona complexidade desnecessária (YAGNI). A duplicação é aceitável porque muda raramente.

**Step 4: Adicionar formatText ao DEFAULTS**

```typescript
// src/main/config.ts, DEFAULTS
const DEFAULTS: FalaiConfig = {
  language: 'auto',
  whisperModel: 'base',
  hotkey: 'Ctrl+Space',
  notchPosition: 'top-center',
  formatText: true,
};
```

**Step 5: Verificar build**

```bash
cd /c/Users/lindo/OneDrive/Desktop/Github/falai
npm run build
```
Expected: Build passa sem erro.

**Step 6: Commit**

```bash
git add src/main/whisper-models.ts src/main/config.ts settings.html
git commit -m "refactor: centralize whisper model options (DRY) + add formatText config"
```

---

### Task 2: Implementar hot-reload de modelo no VoicePipeline

**Objective:** Quando usuário salva config com novo modelo, `VoicePipeline` detecta e envia `load_model` pro worker sem reiniciar o app. SRP: `VoicePipeline` só transcreve, mas reage a config changes relevantes.

**Files:**
- Modify: `src/main/voice-pipeline.ts:33-95`

**Step 1: Adicionar listener de config changed no constructor**

```typescript
// src/main/voice-pipeline.ts

import { execSync } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

import { ConfigManager, FalaiConfig } from './config';
import { WorkerProcess } from './worker-process';

interface WhisperMessage {
  event: string;
  text?: string;
  language?: string;
  duration?: number;
  status?: string;
  model?: string;
  message?: string;
}

function resolvePython(): string {
  const venvPython = path.join(__dirname, '..', '..', 'workers', 'venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) return venvPython;
  for (const cmd of ['python', 'py', 'python3']) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore', timeout: 5000 });
      return cmd;
    } catch { /* next */ }
  }
  return 'python';
}

export class VoicePipeline extends EventEmitter {
  private worker: WorkerProcess;
  private started = false;
  private currentModel: string | null = null;

  constructor(private config: ConfigManager) {
    super();
    const pythonCmd = resolvePython();
    const script = path.join(__dirname, '..', '..', 'workers', 'whisper_worker.py');
    console.log(`[voice-pipeline] Python: ${pythonCmd} | Script: ${script}`);
    this.worker = new WorkerProcess({
      command: pythonCmd,
      args: [script],
      env: { PYTHONIOENCODING: 'utf-8' },
      label: 'voice',
    });
    this.worker.on('message', (msg: WhisperMessage) => this.handleMessage(msg));
    this.worker.on('error', (err: Error) => this.emit('error', err));

    // Hot-reload: reage a mudanças de config relevantes
    this.config.on('changed', (cfg: FalaiConfig) => this.onConfigChanged(cfg));
  }

  private onConfigChanged(cfg: FalaiConfig): void {
    if (cfg.whisperModel && cfg.whisperModel !== this.currentModel) {
      this.worker.send({ cmd: 'load_model', model: cfg.whisperModel });
    }
  }

  async start(): Promise<boolean> {
    if (this.started) return true;
    const ready = await this.worker.start();
    if (!ready) return false;

    const modelName = this.config.get().whisperModel;
    this.currentModel = modelName;
    this.worker.send({ cmd: 'load_model', model: modelName });
    this.started = true;
    return true;
  }

  startRecording(): void {
    const cfg = this.config.get();
    this.worker.send({
      cmd: 'start_recording',
      language: cfg.language === 'auto' ? null : cfg.language,
      format_text: cfg.formatText,
    });
  }

  stopRecording(): void {
    this.worker.send({ cmd: 'stop_recording' });
  }

  dispose(): void {
    this.worker.dispose();
    this.started = false;
  }

  private handleMessage(msg: WhisperMessage): void {
    if (msg.event === 'transcription' && msg.text !== undefined) {
      this.emit('transcription', msg.text);
      return;
    }
    if (msg.event === 'error' && msg.message) {
      this.emit('error', new Error(msg.message));
      return;
    }
    if (msg.event === 'status' && msg.status === 'model_loaded' && msg.model) {
      this.currentModel = msg.model;
      this.emit('status', msg.status);
      return;
    }
    if (msg.event === 'status' && msg.status) {
      this.emit('status', msg.status);
    }
  }
}
```

> **Clean Code aplicado:**
> - `onConfigChanged()` faz uma coisa só (SRP)
> - `currentModel` evita enviar `load_model` desnecessário se o modelo não mudou
> - `handleMessage` extrai `model_loaded` para rastrear estado atual
> - Early returns em vez de if/else aninhados

**Step 2: Verificar build**

```bash
cd /c/Users/lindo/OneDrive/Desktop/Github/falai
npm run build
```
Expected: Build passa sem erro.

**Step 3: Commit**

```bash
git add src/main/voice-pipeline.ts
git commit -m "feat(voice-pipeline): hot-reload whisper model on config change"
```

---

### Task 3: Implementar descarregamento de modelo anterior no worker

**Objective:** Quando `load_model` é chamado com modelo diferente, descarregar o anterior da RAM antes de carregar o novo. Evita acúmulo de memória.

**Files:**
- Modify: `workers/whisper_worker.py:71-91`

**Step 1: Extrair método `_unload_model()` (SRP — função faz uma coisa)**

```python
# workers/whisper_worker.py, substituir load_model (linhas 71-91)

    def unload_model(self) -> None:
        """Descarrega modelo atual da RAM."""
        if self.model is None:
            return
        log(f"Descarregando modelo '{self.model_name}'...")
        del self.model
        self.model = None
        self.model_name = None
        gc.collect()
        log("Modelo anterior descarregado.")

    def load_model(self, model_name: str) -> bool:
        if model_name not in SUPPORTED_MODELS:
            send("error", {"message": f"Modelo não suportado: {model_name}"})
            return False

        if self.model is not None and self.model_name == model_name:
            send("status", {"status": "model_loaded", "model": model_name})
            return True

        try:
            self.unload_model()
            log(f"Carregando modelo '{model_name}'...")
            self.model = WhisperModel(model_name, device="cpu", compute_type="int8")
            self.model_name = model_name
            log(f"Modelo '{model_name}' carregado.")
            send("status", {"status": "model_loaded", "model": model_name})
            return True
        except Exception as exc:
            log(f"Erro ao carregar modelo: {exc}")
            traceback.print_exc(file=sys.stderr)
            send("error", {"message": str(exc)})
            return False
```

**Step 2: Mover `import gc` para o topo do arquivo**

```python
# workers/whisper_worker.py, imports (linhas 1-17)
import base64
import gc
import io
import json
import re
import sys
import traceback
from typing import Any

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel
```

**Step 3: Verificar sintaxe Python**

```bash
cd /c/Users/lindo/OneDrive/Desktop/Github/falai/workers
python -m py_compile whisper_worker.py
```
Expected: Sem output (sucesso).

**Step 4: Commit**

```bash
git add workers/whisper_worker.py
git commit -m "refactor(whisper-worker): extract unload_model() (SRP) + gc import to top"
```

---

### Task 4: Implementar formatação de texto no worker (funções pequenas)

**Objective:** Adicionar pipeline de formatação com funções pequenas e focadas (Ch3 — cada função faz uma coisa). Cada sub-função tem 3-5 linhas.

**Files:**
- Modify: `workers/whisper_worker.py`

**Step 1: Adicionar funções de formatação (cada uma faz UMA coisa)**

```python
# workers/whisper_worker.py, após as constantes (linha ~22)


def _normalize_spaces(text: str) -> str:
    """Colapsa espaços múltiplos e remove espaço antes de pontuação."""
    text = re.sub(r'\s+', ' ', text).strip()
    return re.sub(r'\s+([.,;:!?])', r'\1', text)


def _capitalize_sentences(text: str) -> str:
    """Capitaliza primeira letra de cada frase."""
    sentences = re.split(r'([.!?]\s+)', text)
    for i, part in enumerate(sentences):
        if i % 2 == 0 and part:
            sentences[i] = part[0].upper() + part[1:]
    return ''.join(sentences)


def _ensure_terminal_punctuation(text: str) -> str:
    """Adiciona ponto final se não houver pontuação terminal."""
    if text and text[-1] not in '.!?':
        return text + '.'
    return text


def format_transcription(text: str) -> str:
    """Pós-processa texto cru do Whisper: espaços, capitalização, pontuação."""
    if not text:
        return text
    text = _normalize_spaces(text)
    text = _capitalize_sentences(text)
    text = _ensure_terminal_punctuation(text)
    return text
```

> **Clean Code aplicado (Ch3 — Functions):**
> - `format_transcription` orquestra, não implementa — um nível de abstração só
> - Cada sub-função faz UMA coisa (test do "e": não há "e" na descrição)
> - Nomes são verbos que revelam intenção
> - Cada função tem 3-5 linhas — sem necessidade de scroll
> - Testável individualmente

**Step 2: Aplicar formatação em _transcribe_buffer**

```python
# workers/whisper_worker.py, em _transcribe_buffer, substituir o bloco final

            full_text = " ".join(all_texts).strip()
            final_text = format_transcription(full_text) if self.format_text else full_text
            log(f"Transcrição completa: '{final_text[:100]}{'...' if len(final_text) > 100 else ''}'")
            send("transcription", {
                "text": final_text,
                "language": detected_language or "",
                "duration": total_duration,
            })
```

**Step 3: Verificar sintaxe Python**

```bash
cd /c/Users/lindo/OneDrive/Desktop/Github/falai/workers
python -m py_compile whisper_worker.py
```
Expected: Sem output (sucesso).

**Step 4: Commit**

```bash
git add workers/whisper_worker.py
git commit -m "feat(whisper-worker): add text formatting pipeline (small functions, SRP)"
```

---

### Task 5: Adicionar flag format_text ao worker e respeitar config

**Objective:** Worker recebe `format_text` no comando `start_recording` e respeita a preferência do usuário. Boundary: a flag cruza o boundary TS→Python via JSON.

**Files:**
- Modify: `workers/whisper_worker.py`

**Step 1: Adicionar campo format_text ao WhisperWorker**

```python
# workers/whisper_worker.py, no __init__

class WhisperWorker:
    def __init__(self) -> None:
        self.model: WhisperModel | None = None
        self.model_name: str | None = None
        self.audio_buffer: np.ndarray = np.array([], dtype=np.float32)
        self.recording = False
        self.language: str | None = None
        self.stream: sd.InputStream | None = None
        self.format_text: bool = True
```

**Step 2: Atualizar start_recording para receber format_text**

```python
# workers/whisper_worker.py, start_recording

    def start_recording(self, language: str | None = None, format_text: bool = True) -> None:
        if not self._ensure_stream():
            return
        if self.model is None:
            log("Modelo ainda não carregado; carregando default...")
            if not self.load_model(DEFAULT_MODEL):
                send("error", {"message": "Não foi possível carregar modelo para gravação"})
                return
        self.language = language if language != "auto" else None
        self.format_text = format_text
        self.audio_buffer = np.array([], dtype=np.float32)
        self.recording = True
        send("status", {"status": "listening"})
```

**Step 3: Atualizar handler de main() para passar format_text**

```python
# workers/whisper_worker.py, main(), no handler de start_recording

            if cmd == "load_model":
                worker.load_model(msg.get("model", DEFAULT_MODEL))
            elif cmd == "start_recording":
                worker.start_recording(
                    language=msg.get("language"),
                    format_text=msg.get("format_text", True),
                )
            elif cmd == "stop_recording":
                worker.stop_recording()
```

**Step 4: Verificar sintaxe Python**

```bash
cd /c/Users/lindo/OneDrive/Desktop/Github/falai/workers
python -m py_compile whisper_worker.py
```
Expected: Sem output (sucesso).

**Step 5: Commit**

```bash
git add workers/whisper_worker.py
git commit -m "feat(whisper-worker): accept and respect format_text flag from config"
```

---

### Task 6: Configurar IPC para formatText nas Settings

**Objective:** Garantir que o toggle de `formatText` no settings.html carrega/salva corretamente via IPC.

**Files:**
- Modify: `settings.html` (script)

**Step 1: Adicionar formatText ao loadConfig e saveConfig**

```javascript
// settings.html, script — adicionar formatText aos elementos
const formatTextSelect = document.getElementById('formatText');

// Em loadConfig():
if (cfg.formatText !== undefined) {
  formatTextSelect.value = String(cfg.formatText);
}

// Em saveConfig (objeto passado pra saveConfig):
formatText: formatTextSelect.value === 'true',
```

**Step 2: Verificar build**

```bash
cd /c/Users/lindo/OneDrive/Desktop/Github/falai
npm run build
```
Expected: Build passa sem erro.

**Step 3: Commit**

```bash
git add settings.html
git commit -m "feat(settings): wire formatText toggle to IPC load/save"
```

---

### Task 7: Garantir timeout adequado para áudio de 5 minutos

**Objective:** Com 5 min (300s) de áudio, chunking gera ~13 chunks. Cada chunk leva ~2-5s em CPU. Total ~30-65s de processamento. Precisamos garantir que o pipeline não timeout.

**Files:**
- Read: `src/main/worker-process.ts`
- Read: `src/main/pipeline.ts`

**Step 1: Verificar timeouts existentes**

```bash
cd /c/Users/lindo/OneDrive/Desktop/Github/falai
# Ler worker-process.ts e pipeline.ts procurando por timeout
```

**Step 2: Se houver timeout < 120s, aumentar para 120s**

Dar margem de 2 minutos para transcrição de 5 minutos de áudio.

```typescript
// Exemplo: se houver timeout em waitForReady ou send(), aumentar
// const TRANSCRIPTION_TIMEOUT_MS = 120_000; // 2 min para 5min de áudio
```

**Step 3: Verificar build**

```bash
npm run build
```
Expected: Build passa sem erro.

**Step 4: Commit (se houver mudanças)**

```bash
git add src/main/worker-process.ts src/main/pipeline.ts
git commit -m "fix: increase transcription timeout for long audio (up to 5min)"
```

---

### Task 8: Atualizar documentação (SPEC.md)

**Objective:** Documentar as novas features no SPEC.md.

**Files:**
- Modify: `docs/SPEC.md`

**Step 1: Atualizar seção 5.4 (VoicePipeline)**

```markdown
### 5.4 VoicePipeline
- Estende `WorkerProcess` para gerenciar `whisper_worker.py`.
- Envia comando `start_recording` / `stop_recording` via stdin JSON.
- Recebe eventos `audio_chunk`, `transcription`, `error`.
- Mantém modelo carregado na memória (warm).
- **Hot-reload:** reage a `config.on('changed')` e envia `load_model` se o modelo mudar.
- **formatText:** envia flag `format_text` no `start_recording` para ligar/desligar formatação.
```

**Step 2: Adicionar seção 5.8 (Text Formatting)**

```markdown
### 5.8 Text Formatting
- Pipeline de pós-processamento no worker Python.
- Funções pequenas com SRP: `_normalize_spaces()`, `_capitalize_sentences()`, `_ensure_terminal_punctuation()`.
- Orquestrada por `format_transcription()`.
- Toggle via config `formatText` (default: true).
```

**Step 3: Atualizar schema de config (seção 5.7)**

```markdown
### 5.7 Config
- Local: `%APPDATA%/Falai/config.json`.
- Schema:
  ```json
  {
    "language": "auto",
    "whisperModel": "base",
    "hotkey": "Ctrl+Space",
    "notchPosition": "top-center",
    "formatText": true
  }
  ```
- Modelos suportados: tiny, base, small, medium, large, large-v3.
- Modelos definidos em `src/main/whisper-models.ts` (fonte única de verdade).
```

**Step 4: Commit**

```bash
git add docs/SPEC.md
git commit -m "docs: update SPEC with hot-reload, text formatting, and model options"
```

---

## Resumo das Mudanças

| Arquivo | Mudança | Clean Code |
|---------|---------|------------|
| `src/main/whisper-models.ts` | **Novo** — fonte única de modelos (DRY) | Ch12: DRY |
| `src/main/config.ts` | Adicionar `formatText`, usar `WhisperModelName` | Ch6: tipos fortes |
| `src/main/voice-pipeline.ts` | Hot-reload via `config.on('changed')`, `currentModel` tracking | Ch3: SRP, early returns |
| `workers/whisper_worker.py` | `unload_model()` extraído, `format_transcription()` com sub-funções, `format_text` flag | Ch3: funções pequenas, Ch7: error handling |
| `settings.html` | Options dinâmicos, toggle de formatação | Ch4: código se explica |
| `docs/SPEC.md` | Documentar features | — |

## Verificação Final

- [ ] Build passa: `npm run build`
- [ ] Python sintaxe OK: `python -m py_compile workers/whisper_worker.py`
- [ ] Troca de modelo em runtime funciona (settings → gravar → transcreve)
- [ ] Formatação ativada: texto sai capitalizado e pontuado
- [ ] Formatação desativada: texto sai cru
- [ ] Áudio de 30s+ transcreve completo
- [ ] Documentação atualizada

---

**Plan saved to:** `.hermes/plans/falai-model-formatting-5min.md`

**Ready to execute using subagent-driven-development.** Shall I proceed?

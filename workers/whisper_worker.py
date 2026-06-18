#!/usr/bin/env python3
"""
FALAI Whisper Worker
Captura áudio do microfone via sounddevice e transcreve com Faster-Whisper.
Protocolo: JSON lines via stdin/stdout.
"""

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

DEFAULT_MODEL = "base"
SUPPORTED_MODELS = {"tiny", "base", "small", "medium", "large", "large-v2", "large-v3"}
SAMPLE_RATE = 16000


def log(msg: str) -> None:
    print(f"[whisper_worker] {msg}", file=sys.stderr, flush=True)


def send(event: str, payload: dict[str, Any]) -> None:
    print(json.dumps({"event": event, **payload}), flush=True)


# ---------------------------------------------------------------------------
# Text formatting — small functions, each does one thing (Clean Code Ch3)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# WhisperWorker
# ---------------------------------------------------------------------------

class WhisperWorker:
    def __init__(self) -> None:
        self.model: WhisperModel | None = None
        self.model_name: str | None = None
        self.audio_buffer: np.ndarray = np.array([], dtype=np.float32)
        self.recording = False
        self.language: str | None = None
        self.stream: sd.InputStream | None = None
        self.format_text: bool = True

    def _ensure_stream(self) -> bool:
        if self.stream is not None:
            return True
        try:
            self.stream = sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype=np.float32,
                blocksize=int(SAMPLE_RATE * 0.1),
                callback=_audio_callback(self),
            )
            self.stream.start()
            return True
        except Exception as exc:
            log(f"Erro ao abrir microfone: {exc}")
            traceback.print_exc(file=sys.stderr)
            send("error", {"message": f"Microfone indisponível: {exc}"})
            return False

    def _close_stream(self) -> None:
        if self.stream is None:
            return
        try:
            self.stream.stop()
            self.stream.close()
        except Exception as exc:
            log(f"Erro ao fechar stream: {exc}")
        finally:
            self.stream = None

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

    def stop_recording(self) -> None:
        self.recording = False
        self._close_stream()
        send("status", {"status": "processing"})
        self._transcribe_buffer()

    def feed_chunk(self, chunk: np.ndarray) -> None:
        if not self.recording:
            return
        self.audio_buffer = np.concatenate((self.audio_buffer, chunk))
        # Log a cada 5 segundos de áudio acumulado
        duration = len(self.audio_buffer) / SAMPLE_RATE
        if int(duration) % 5 == 0 and duration > 0:
            log(f"Áudio acumulado: {duration:.1f}s")

    def _transcribe_buffer(self) -> None:
        if self.audio_buffer.size == 0:
            send("transcription", {"text": "", "language": "", "duration": 0.0})
            return

        if self.model is None:
            if not self.load_model(DEFAULT_MODEL):
                send("error", {"message": "Nenhum modelo disponível"})
                return

        try:
            total_duration = len(self.audio_buffer) / SAMPLE_RATE
            log(f"Transcrevendo {total_duration:.1f}s de áudio...")

            # Whisper base tem contexto limitado (~30s). Chunk em 25s com 2s overlap.
            CHUNK_DURATION = 25.0
            OVERLAP_DURATION = 2.0
            chunk_samples = int(CHUNK_DURATION * SAMPLE_RATE)
            overlap_samples = int(OVERLAP_DURATION * SAMPLE_RATE)

            all_texts: list[str] = []
            detected_language = self.language

            start = 0
            while start < len(self.audio_buffer):
                end = min(start + chunk_samples, len(self.audio_buffer))
                chunk = self.audio_buffer[start:end]

                segments, info = self.model.transcribe(
                    chunk,
                    language=detected_language,
                    beam_size=5,
                    vad_filter=False,
                    condition_on_previous_text=False,  # evita acumulo de erro entre chunks
                )
                chunk_text = " ".join(seg.text.strip() for seg in segments).strip()
                if chunk_text:
                    all_texts.append(chunk_text)
                if detected_language is None:
                    detected_language = info.language

                log(f"  Chunk {start/SAMPLE_RATE:.1f}s-{end/SAMPLE_RATE:.1f}s: '{chunk_text[:60]}{'...' if len(chunk_text) > 60 else ''}'")

                if end >= len(self.audio_buffer):
                    break
                start = end - overlap_samples  # overlap para não perder palavras no corte

            full_text = " ".join(all_texts).strip()
            final_text = format_transcription(full_text) if self.format_text else full_text
            log(f"Transcrição completa: '{final_text[:100]}{'...' if len(final_text) > 100 else ''}'")
            send("transcription", {
                "text": final_text,
                "language": detected_language or "",
                "duration": total_duration,
            })
        except Exception as exc:
            log(f"Erro na transcrição: {exc}")
            traceback.print_exc(file=sys.stderr)
            send("error", {"message": str(exc)})
        finally:
            self.audio_buffer = np.array([], dtype=np.float32)


def _audio_callback(worker: WhisperWorker) -> sd.CallbackFlags:
    def callback(indata: np.ndarray, _frames: int, _time_info: sd.CallbackFlags, _status: sd.CallbackFlags) -> None:
        worker.feed_chunk(indata[:, 0].astype(np.float32))
    return callback


def main() -> None:
    log("Whisper Worker iniciando")
    worker = WhisperWorker()

    send("ready", {"worker": "whisper_worker"})

    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue

            try:
                msg = json.loads(line)
            except json.JSONDecodeError as exc:
                send("error", {"message": f"JSON inválido: {exc}"})
                continue

            cmd = msg.get("cmd")
            try:
                if cmd == "load_model":
                    worker.load_model(msg.get("model", DEFAULT_MODEL))
                elif cmd == "start_recording":
                    worker.start_recording(
                        language=msg.get("language"),
                        format_text=msg.get("format_text", True),
                    )
                elif cmd == "stop_recording":
                    worker.stop_recording()
                elif cmd == "shutdown":
                    send("status", {"status": "exiting"})
                    break
                else:
                    send("error", {"message": f"Comando desconhecido: {cmd}"})
            except Exception as exc:
                log(f"Erro no comando '{cmd}': {exc}")
                traceback.print_exc(file=sys.stderr)
                send("error", {"message": str(exc)})
    finally:
        worker._close_stream()
        log("Whisper Worker finalizado")


if __name__ == "__main__":
    main()

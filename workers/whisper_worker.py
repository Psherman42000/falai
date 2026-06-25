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

DEFAULT_MODEL = "small"
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
# Audio pre-processing — silence trim + volume normalization + noise reduction
# ---------------------------------------------------------------------------

_HAS_NOISEREDUCE = False
try:
    import noisereduce as nr
    _HAS_NOISEREDUCE = True
except ImportError:
    pass


def _rms(samples: np.ndarray) -> float:
    """Root-mean-square do sinal."""
    return float(np.sqrt(np.mean(samples ** 2)))


def _trim_silence(
    samples: np.ndarray,
    sr: int,
    threshold: float = 0.02,
    min_silence_ms: int = 300,
) -> np.ndarray:
    """Remove silêncio inicial e final do áudio.

    Calcula envelope de energia em frames de 10ms. Corta tudo abaixo de
    ``threshold * peak_energy`` nas bordas. Mantém pelo menos ``min_silence_ms``
    de silêncio residual em cada ponta pra não cortar consoantes suaves.
    """
    if samples.size == 0:
        return samples
    frame_len = int(sr * 0.01)  # 10ms frames
    n_frames = max(1, samples.size // frame_len)
    # Energia RMS por frame
    frames = samples[: n_frames * frame_len].reshape(n_frames, frame_len)
    energies = np.sqrt(np.mean(frames ** 2, axis=1))
    peak = energies.max()
    if peak < 1e-6:
        return samples  # sinal morto, não corta
    mask = energies > threshold * peak
    if not mask.any():
        return samples  # sem nada acima do threshold
    # Primeiro e último frame com energia
    first = int(mask.argmax())
    last = int(n_frames - mask[::-1].argmax() - 1)
    # Margem de segurança (min_silence_ms)
    margin = max(1, min_silence_ms // 10)
    first = max(0, first - margin)
    last = min(n_frames - 1, last + margin)
    return samples[first * frame_len : (last + 1) * frame_len]


def _normalize_volume(samples: np.ndarray, target_rms: float = 0.08) -> np.ndarray:
    """Normaliza volume RMS do sinal pra ``target_rms``.

    Evita que áudios muito baixos ou muito altos prejudiquem a transcrição.
    """
    if samples.size == 0:
        return samples
    current = _rms(samples)
    if current < 1e-6:
        return samples
    gain = target_rms / current
    # Limita ganho excessivo (evita explodir ruído de fundo)
    gain = min(gain, 3.0)
    return (samples * gain).astype(np.float32)


def _reduce_noise(samples: np.ndarray, sr: int = 16000) -> np.ndarray:
    """Aplica noise reduction via noisereduce se disponível.

    Usa stationary noise reduction (perfil de ruído do início do áudio).
    Se noisereduce não estiver instalado, retorna o áudio original.
    """
    if not _HAS_NOISEREDUCE or samples.size == 0:
        return samples
    try:
        log(f"Aplicando noise reduction ({len(samples)/sr:.1f}s)...")
        # Usa os primeiros 500ms como perfil de ruído
        noise_profile = samples[:min(int(sr * 0.5), samples.size)]
        reduced = nr.reduce_noise(y=samples, sr=sr, y_noise=noise_profile, stationary=True)
        log("Noise reduction concluído.")
        return reduced.astype(np.float32)
    except Exception as exc:
        log(f"Noise reduction falhou (seguindo sem): {exc}")
        return samples


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
        self.reduce_noise: bool = False

    def _ensure_stream(self, device: str | int | None = None) -> bool:
        if self.stream is not None:
            return True
        try:
            dev_name = str(device) if device is not None else "default"
            log(f"Opening InputStream device={dev_name}")
            self.stream = sd.InputStream(
                device=device,
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

            # Tenta GPU (float16) primeiro — mesma estratégia do Hermes
            try:
                self.model = WhisperModel(model_name, device="auto", compute_type="auto")
                log(f"Modelo '{model_name}' carregado (GPU/auto).")
            except Exception as exc:
                msg = str(exc).lower()
                # Só cai pra CPU se for erro de CUDA — outros erros (OOM, modelo inválido) sobem
                is_cuda_err = any(
                    m in msg for m in [
                        "libcublas", "libcudnn", "libcudart",
                        "cannot be loaded", "cannot open shared object",
                        "no kernel image", "no cuda-capable device",
                        "cuda driver version is insufficient",
                    ]
                )
                if not is_cuda_err:
                    raise
                log(f"CUDA indisponível ({exc}) — caindo pra CPU int8...")
                self.model = WhisperModel(model_name, device="cpu", compute_type="int8")
                log(f"Modelo '{model_name}' carregado (CPU int8).")

            self.model_name = model_name
            send("status", {"status": "model_loaded", "model": model_name})
            return True
        except Exception as exc:
            log(f"Erro ao carregar modelo: {exc}")
            traceback.print_exc(file=sys.stderr)
            send("error", {"message": str(exc)})
            return False

    def start_recording(self, language: str | None = None, format_text: bool = True, device: str | int | None = None, reduce_noise: bool = False) -> None:
        if not self._ensure_stream(device):
            return
        if self.model is None:
            log("Modelo ainda não carregado; carregando default...")
            if not self.load_model(DEFAULT_MODEL):
                send("error", {"message": "Não foi possível carregar modelo para gravação"})
                return
        self.language = language if language != "auto" else None
        self.format_text = format_text
        self.reduce_noise = reduce_noise
        self.audio_buffer = np.array([], dtype=np.float32)
        self.recording = True
        send("status", {"status": "listening"})

    def stop_recording(self) -> None:
        self.recording = False
        self._close_stream()
        send("status", {"status": "processing"})
        if len(self.audio_buffer) == 0:
            log("AVISO: 0 samples capturados — microfone pode estar mudo ou dispositivo incorreto")
            send("warn", {"message": "Nenhum áudio capturado. Verifique se o microfone está funcionando e selecionado."})
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
            # --- Pré-processamento: trim silence → noise reduction → normalize volume ---
            raw = self.audio_buffer
            trimmed = _trim_silence(raw, SAMPLE_RATE)
            if len(trimmed) < SAMPLE_RATE * 0.3:  # < 300ms de áudio útil
                log(f"Áudio muito curto após trim: {len(trimmed)/SAMPLE_RATE:.1f}s — possivelmente microfone mudo")
                send("transcription", {"text": "", "language": "", "duration": 0.0})
                return
            # Noise reduction (opcional)
            cleaned = _reduce_noise(trimmed, SAMPLE_RATE) if self.reduce_noise else trimmed
            normalized = _normalize_volume(cleaned)
            total_duration = len(normalized) / SAMPLE_RATE
            log(f"Áudio pré-processado: {len(raw)/SAMPLE_RATE:.1f}s → {total_duration:.1f}s (trim{' + nr' if self.reduce_noise else ''} + normalize)")

            # Whisper base tem contexto limitado (~30s). Chunk em 25s com 3s overlap.
            CHUNK_DURATION = 25.0
            OVERLAP_DURATION = 3.0
            chunk_samples = int(CHUNK_DURATION * SAMPLE_RATE)
            overlap_samples = int(OVERLAP_DURATION * SAMPLE_RATE)

            all_texts: list[str] = []
            detected_language = self.language
            last_chunk_tail: str = ""  # para dedup nas bordas entre chunks

            start = 0
            while start < len(normalized):
                end = min(start + chunk_samples, len(normalized))
                chunk = normalized[start:end]

                segments, info = self.model.transcribe(
                    chunk,
                    language=detected_language,
                    beam_size=5,
                    vad_filter=True,
                    condition_on_previous_text=False,
                )
                chunk_text = " ".join(seg.text.strip() for seg in segments).strip()

                # Dedup: se as primeiras N palavras do chunk atual repetem
                # o final do chunk anterior, remove a duplicata
                if chunk_text and last_chunk_tail:
                    current_words = chunk_text.split()
                    tail_words = last_chunk_tail.split()
                    # Tenta casar o máximo de palavras consecutivas do tail no início do current
                    overlap_count = 0
                    for i in range(min(len(current_words), len(tail_words)), 0, -1):
                        # Compara as últimas i palavras do tail com as primeiras i do current
                        tail_end = tail_words[-i:] if i <= len(tail_words) else tail_words
                        current_start = current_words[:i]
                        if tail_end == current_start:
                            overlap_count = i
                            break
                    if overlap_count > 0:
                        chunk_text = " ".join(current_words[overlap_count:])
                        log(f"  Dedup: removidas {overlap_count} palavras repetidas na borda")

                if chunk_text:
                    all_texts.append(chunk_text)
                    # Guarda fim do chunk para dedup (últimas ~15 palavras)
                    words = chunk_text.split()
                    last_chunk_tail = " ".join(words[-15:]) if len(words) > 15 else chunk_text
                else:
                    last_chunk_tail = ""
                if detected_language is None:
                    detected_language = info.language

                log(f"  Chunk {start/SAMPLE_RATE:.1f}s-{end/SAMPLE_RATE:.1f}s: '{chunk_text[:60]}{'...' if len(chunk_text) > 60 else ''}'")

                if end >= len(raw):
                    break
                start = end - overlap_samples

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


def list_input_devices() -> list[dict]:
    """Retorna lista de dispositivos de entrada disponíveis."""
    try:
        devices = sd.query_devices()
        result = []
        for i, dev in enumerate(devices):
            if dev["max_input_channels"] > 0:
                result.append({
                    "index": i,
                    "name": dev["name"],
                    "channels": dev["max_input_channels"],
                    "sr": int(dev["default_samplerate"]) if dev["default_samplerate"] else 0,
                    "hostapi": dev["hostapi"],
                })
        return result
    except Exception as exc:
        log(f"Erro ao listar devices: {exc}")
        return []


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
                        device=msg.get("device"),
                        reduce_noise=msg.get("reduce_noise", False),
                    )
                elif cmd == "stop_recording":
                    worker.stop_recording()
                elif cmd == "list_devices":
                    send("devices", {"devices": list_input_devices()})
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

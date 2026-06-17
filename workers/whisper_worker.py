#!/usr/bin/env python3
"""
FALAI Whisper Worker
Captura áudio do microfone via sounddevice e transcreve com Faster-Whisper.
Protocolo: JSON lines via stdin/stdout.
"""

import base64
import io
import json
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


class WhisperWorker:
    def __init__(self) -> None:
        self.model: WhisperModel | None = None
        self.model_name: str | None = None
        self.audio_buffer: np.ndarray = np.array([], dtype=np.float32)
        self.recording = False
        self.language: str | None = None

    def load_model(self, model_name: str) -> bool:
        if model_name not in SUPPORTED_MODELS:
            send("error", {"message": f"Modelo não suportado: {model_name}"})
            return False

        if self.model and self.model_name == model_name:
            return True

        try:
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

    def start_recording(self, language: str | None = None) -> None:
        self.language = language if language != "auto" else None
        self.audio_buffer = np.array([], dtype=np.float32)
        self.recording = True
        send("status", {"status": "listening"})

    def stop_recording(self) -> None:
        self.recording = False
        send("status", {"status": "processing"})
        self._transcribe_buffer()

    def feed_chunk(self, chunk: np.ndarray) -> None:
        if not self.recording:
            return
        self.audio_buffer = np.concatenate((self.audio_buffer, chunk))

    def _transcribe_buffer(self) -> None:
        if self.audio_buffer.size == 0:
            send("transcription", {"text": "", "language": "", "duration": 0.0})
            return

        if self.model is None:
            if not self.load_model(DEFAULT_MODEL):
                send("error", {"message": "Nenhum modelo disponível"})
                return

        try:
            segments, info = self.model.transcribe(
                self.audio_buffer,
                language=self.language,
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(
                    threshold=0.5,
                    min_speech_duration_ms=250,
                    min_silence_duration_ms=350,
                ),
            )
            text = " ".join(seg.text.strip() for seg in segments).strip()
            send("transcription", {
                "text": text,
                "language": info.language,
                "duration": info.duration,
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

    stream = sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype=np.float32,
        blocksize=int(SAMPLE_RATE * 0.1),
        callback=_audio_callback(worker),
    )
    stream.start()

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
                    worker.start_recording(msg.get("language"))
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
        stream.stop()
        stream.close()
        log("Whisper Worker finalizado")


if __name__ == "__main__":
    main()

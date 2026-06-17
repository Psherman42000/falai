#!/usr/bin/env python3
"""
FALAI Hotkey Worker
Hook global de teclado via pynput. Envia eventos JSON-line pelo stdout.
"""

import json
import sys
import threading
import traceback
from typing import Any

from pynput import keyboard


def log(msg: str) -> None:
    print(f"[hotkey_worker] {msg}", file=sys.stderr, flush=True)


def send(event: str, payload: dict[str, Any]) -> None:
    print(json.dumps({"event": event, **payload}), flush=True)


class HotkeyWorker:
    def __init__(self, combo: list[str]) -> None:
        self.combo = {self._normalize(k) for k in combo}
        self.pressed: set[str] = set()
        self.active = False
        self.listener: keyboard.Listener | None = None

    @staticmethod
    def _normalize(key: str) -> str:
        key = key.lower().strip()
        aliases = {
            "ctrl": "ctrl_l",
            "control": "ctrl_l",
            "alt": "alt_l",
            "shift": "shift_l",
            "cmd": "cmd_l",
            "command": "cmd_l",
            "win": "cmd_l",
            "windows": "cmd_l",
            "space": "space",
        }
        return aliases.get(key, key)

    def _key_to_str(self, key: keyboard.Key | keyboard.KeyCode) -> str:
        if isinstance(key, keyboard.Key):
            return key.name
        if isinstance(key, keyboard.KeyCode):
            return key.char.lower() if key.char else str(key.vk)
        return str(key)

    def _is_trigger(self) -> bool:
        return self.combo.issubset(self.pressed)

    def _on_press(self, key: keyboard.Key | keyboard.KeyCode) -> None:
        name = self._key_to_str(key)
        if name in self.pressed:
            return
        self.pressed.add(name)
        if self._is_trigger() and not self.active:
            self.active = True
            send("hotkey_pressed", {"combo": list(self.combo)})

    def _on_release(self, key: keyboard.Key | keyboard.KeyCode) -> None:
        name = self._key_to_str(key)
        self.pressed.discard(name)
        if self.active and not self._is_trigger():
            self.active = False
            send("hotkey_released", {"combo": list(self.combo)})

    def start(self) -> bool:
        try:
            self.listener = keyboard.Listener(
                on_press=self._on_press,
                on_release=self._on_release,
                suppress=False,
            )
            self.listener.start()
            send("ready", {"worker": "hotkey_worker", "combo": list(self.combo)})
            return True
        except Exception as exc:
            log(f"Erro ao iniciar listener: {exc}")
            traceback.print_exc(file=sys.stderr)
            send("error", {"message": str(exc)})
            return False

    def stop(self) -> None:
        if self.listener:
            self.listener.stop()
            self.listener = None


def main() -> None:
    log("Hotkey Worker iniciando")
    combo = ["ctrl", "space"]
    if len(sys.argv) > 1:
        combo = sys.argv[1].split("+")

    worker = HotkeyWorker(combo)
    if not worker.start():
        sys.exit(1)

    try:
        # Mantém vivo até stdin fechar.
        for _ in sys.stdin:
            pass
    except KeyboardInterrupt:
        pass
    finally:
        worker.stop()
        log("Hotkey Worker finalizado")


if __name__ == "__main__":
    main()

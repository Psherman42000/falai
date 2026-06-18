#!/usr/bin/env bash
# Build Python workers as standalone .exe using PyInstaller (--onedir for fast startup)
# Output: dist/workers/whisper_worker.exe, dist/workers/hotkey_worker.exe
# Dependencies extracted to subdirectories at build time, not at runtime.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKERS_DIR="$PROJECT_DIR/workers"
VENV_PYTHON="$WORKERS_DIR/venv/Scripts/python.exe"
DIST_DIR="$PROJECT_DIR/dist/workers"

if [ ! -f "$VENV_PYTHON" ]; then
  echo "[build-workers] venv not found at $VENV_PYTHON"
  echo "[build-workers] Creating venv and installing requirements..."
  cd "$WORKERS_DIR"
  python -m venv venv
  venv/Scripts/pip install -r requirements.txt pyinstaller
  cd "$PROJECT_DIR"
fi

echo "[build-workers] Cleaning old build..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "[build-workers] Building whisper_worker.exe (onedir)..."
"$VENV_PYTHON" -m PyInstaller \
  --onedir \
  --name whisper_worker \
  --distpath "$DIST_DIR" \
  --workpath "$WORKERS_DIR/build_whisper" \
  --specpath "$WORKERS_DIR" \
  --hidden-import faster_whisper \
  --hidden-import sounddevice \
  --hidden-import numpy \
  --hidden-import gc \
  --hidden-import re \
  --collect-all faster_whisper \
  --collect-all sounddevice \
  --collect-all numpy \
  --noconfirm \
  "$WORKERS_DIR/whisper_worker.py"

echo "[build-workers] Building hotkey_worker.exe (onedir)..."
"$VENV_PYTHON" -m PyInstaller \
  --onedir \
  --name hotkey_worker \
  --distpath "$DIST_DIR" \
  --workpath "$WORKERS_DIR/build_hotkey" \
  --specpath "$WORKERS_DIR" \
  --hidden-import pynput \
  --hidden-import pynput.keyboard \
  --hidden-import pynput.keyboard.win32 \
  --collect-all pynput \
  --noconfirm \
  "$WORKERS_DIR/hotkey_worker.py"

echo "[build-workers] Cleaning PyInstaller artifacts..."
rm -rf "$WORKERS_DIR/build_whisper" "$WORKERS_DIR/build_hotkey"
rm -f "$WORKERS_DIR/whisper_worker.spec" "$WORKERS_DIR/hotkey_worker.spec"

echo "[build-workers] Done. Workers at: $DIST_DIR"
ls -lh "$DIST_DIR" "$DIST_DIR/whisper_worker/" "$DIST_DIR/hotkey_worker/"

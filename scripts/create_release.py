#!/usr/bin/env python3
"""Create GitHub release v1.3.1 and upload installer."""
import json, os, subprocess, urllib.request, sys

def get_token():
    p = subprocess.run(["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True, text=True)
    for line in p.stdout.split('\n'):
        if line.startswith('password='):
            return line.split('=', 1)[1].strip()
    return None

token = get_token()
if not token:
    print("ERROR: no GitHub token"); sys.exit(1)

headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github+json"}
base = "https://api.github.com/repos/Psherman42000/falai"

data = json.dumps({
    "tag_name": "v1.3.1",
    "name": "FALAI v1.3.1",
    "body": """## FALAI v1.3.1

### Melhorias

- **VAD ativado** — Silero VAD v6 filtra silêncio/ruído antes da transcrição. Redz erros e alucinações.
- **Config de idioma funciona** — bug do `navigator.language` corrigido (variável renomeada)
- **Settings reabre** — janela sempre recria do zero
- **Config aplica em tempo real** — posição, modelo, idioma mudam na hora
- **Workers limpos** — removido debug code e lixo do ipc/config.ts

### Download

Baixe `FALAI-Setup-1.3.1.exe` e execute.

### Requisitos

- Windows 10/11 64-bit
- Microfone funcionando
- Executar como Administrador (atalho global)"""
}).encode()

req = urllib.request.Request(f"{base}/releases", data=data, headers=headers, method="POST")
with urllib.request.urlopen(req) as r:
    release = json.loads(r.read())
    rid = release['id']
    print(f"Release: {release['html_url']}")

exe = r"C:\Users\lindo\OneDrive\Desktop\Github\falai\release\FALAI-Setup-1.3.1.exe"
size = os.path.getsize(exe)
print(f"Uploading {size/1024/1024:.1f}MB...")
with open(exe, 'rb') as f:
    data = f.read()

url = f"https://uploads.github.com/repos/Psherman42000/falai/releases/{rid}/assets?name=FALAI-Setup-1.3.1.exe"
req = urllib.request.Request(url, data=data,
    headers={**headers, "Content-Type": "application/octet-stream"}, method="POST")
with urllib.request.urlopen(req, timeout=600) as r:
    a = json.loads(r.read())
    print(f"Uploaded: {a['browser_download_url']}")

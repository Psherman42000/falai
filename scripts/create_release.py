#!/usr/bin/env python3
"""Create GitHub release and upload FALAI-Setup-1.3.0.exe."""
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

# Create release
data = json.dumps({
    "tag_name": "v1.3.0",
    "name": "FALAI v1.3.0",
    "body": """## FALAI v1.3.0

### Correções

- **Settings reabre corretamente** — janela fecha de verdade (`.close()` em vez de `.hide()`)
- **Config salva e persiste** — variável `language` renomeada pra `langSelect` (conflito com `navigator.language` do Chromium)
- **Config aplica em tempo real** — notch reposiciona ao salvar, modelo recarrega sem reiniciar
- **Notch redesenhado** — pill na parte inferior, glassmorphism, waveform animado, botões no hover
- **Workers instantâneos** — PyInstaller `--onedir` em vez de `--onefile` (sem extração de 18s)
- **Múltiplas instâncias** — `requestSingleInstanceLock()` impede processos duplicados
- **Diálogo de erro** — app mostra motivo quando falha ao iniciar
- **6 posições do notch** — top/bottom + center/left/right
- **Ícone FALAI** — executável e instalador com ícone customizado

### Download

Baixe `FALAI-Setup-1.3.0.exe` e execute. Não precisa instalar nada mais.

### Requisitos

- Windows 10/11 64-bit
- Microfone funcionando
- Executar como Administrador (atalho global)"""
}).encode()

req = urllib.request.Request(f"{base}/releases", data=data,
    headers=headers, method="POST")
with urllib.request.urlopen(req) as r:
    release = json.loads(r.read())
    rid = release['id']
    print(f"Release created: {release['html_url']}")

# Upload
exe = r"C:\Users\lindo\OneDrive\Desktop\Github\falai\release\FALAI-Setup-1.3.0.exe"
size = os.path.getsize(exe)
print(f"Uploading {size/1024/1024:.1f}MB...")
with open(exe, 'rb') as f:
    data = f.read()

url = f"https://uploads.github.com/repos/Psherman42000/falai/releases/{rid}/assets?name=FALAI-Setup-1.3.0.exe"
req = urllib.request.Request(url, data=data, headers={
    **headers, "Content-Type": "application/octet-stream"
}, method="POST")
with urllib.request.urlopen(req, timeout=600) as r:
    a = json.loads(r.read())
    print(f"Uploaded: {a['browser_download_url']}")

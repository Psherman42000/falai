#!/usr/bin/env python3
"""Upload FALAI-Setup-1.2.0.exe to GitHub release."""
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
    print("ERROR: no GitHub token")
    sys.exit(1)

headers = {
    "Authorization": f"token {token}",
    "Accept": "application/vnd.github+json"
}

base = "https://api.github.com/repos/Psherman42000/falai"

# Try to get release, create if doesn't exist
try:
    req = urllib.request.Request(f"{base}/releases/tags/v1.2.0", headers=headers)
    with urllib.request.urlopen(req) as r:
        release = json.loads(r.read())
    rid = release['id']
    print(f"Found existing release: {rid}")

    for asset in release.get('assets', []):
        dr = urllib.request.Request(
            f"{base}/releases/assets/{asset['id']}",
            headers=headers, method="DELETE")
        with urllib.request.urlopen(dr) as rr:
            print(f"Deleted {asset['name']}: {rr.status}")
except urllib.error.HTTPError as e:
    if e.code == 404:
        # Create new release
        data = json.dumps({
            "tag_name": "v1.2.0",
            "name": "FALAI v1.2.0"
        }).encode()
        req = urllib.request.Request(f"{base}/releases", data=data,
            headers=headers, method="POST")
        with urllib.request.urlopen(req) as r:
            release = json.loads(r.read())
        rid = release['id']
        print(f"Created new release: {rid}")
    else:
        raise

# Upload
exe = r"C:\Users\lindo\OneDrive\Desktop\Github\falai\release\FALAI-Setup-1.2.0.exe"
size = os.path.getsize(exe)
print(f"Uploading {size/1024/1024:.1f}MB...")
with open(exe, 'rb') as f:
    data = f.read()

url = f"https://uploads.github.com/repos/Psherman42000/falai/releases/{rid}/assets?name=FALAI-Setup-1.2.0.exe"
req = urllib.request.Request(url, data=data, headers={
    **headers, "Content-Type": "application/octet-stream"
}, method="POST")
with urllib.request.urlopen(req, timeout=600) as r:
    a = json.loads(r.read())
    print(f"Uploaded!")
    print(f"URL: {a['browser_download_url']}")
    print(f"Size: {a['size']/1024/1024:.1f}MB")

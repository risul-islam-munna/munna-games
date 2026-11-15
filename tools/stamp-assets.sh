#!/usr/bin/env bash
#
# Stamp a content-hash revision onto every root-absolute CSS/JS/image reference
# (href, src, srcset, imagesrcset) in the site's HTML pages, e.g.
#   <link rel="stylesheet" href="/assets/site.css?v=3f2a9c01be">
#   <script defer src="/dual-play/assets/landing.js?v=81c0d4e2aa"></script>
#
# Why: GitHub Pages/Cloudflare cache CSS/JS under a fixed name, so after a
# deploy a returning visitor could get the NEW HTML with OLD CSS/JS or an old
# screenshot that kept its file name. The ?v= is
# the first 10 hex chars of the file's SHA-256, so it changes exactly when the
# file changes and is identical on every run (reproducible, no random or
# per-request busting). Idempotent; only rewrites pages whose stamp changed.
#
#   tools/stamp-assets.sh          rewrite pages in place
#   tools/stamp-assets.sh --check  exit 1 if any page is missing/has a stale stamp
#
# Skips the Flutter build in /*/play/ (its own stamps come from deploy_web.sh),
# /push-admin/ (an ES-module tool: stamping only its entry module would mix old
# and new imported modules) and external URLs. Run it after editing any /assets or /<game>/assets CSS/JS.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
[[ -f "$ROOT/CNAME" && -f "$ROOT/index.html" ]] || { echo "ERROR: $ROOT is not the site root" >&2; exit 1; }

exec /usr/bin/env python3 -I - "$ROOT" "${1:-}" <<'PY'
import hashlib, os, re, sys

root, mode = sys.argv[1], sys.argv[2]
check = mode == "--check"
attr = re.compile(r'(\b(?:href|src|srcset|imagesrcset)=")([^"]*)(")')
asset = re.compile(r'(?<![\w:/.])(/[^"?#\s,]+\.(?:css|js|webp|png|jpe?g|svg|gif|avif))(?:\?v=[0-9a-f]+)?')
hashes, stale, changed = {}, [], []

def rev(path):
    if path not in hashes:
        full = os.path.join(root, path.lstrip("/"))
        if not os.path.isfile(full):
            raise SystemExit(f"ERROR: referenced file not found: {path}")
        with open(full, "rb") as f:
            hashes[path] = hashlib.sha256(f.read()).hexdigest()[:10]
    return hashes[path]

for dirpath, dirnames, filenames in os.walk(root):
    rel = os.path.relpath(dirpath, root)
    parts = rel.split(os.sep)
    # never touch hidden dirs, node_modules or a compiled Flutter build
    dirnames[:] = [d for d in dirnames if not d.startswith(".") and d != "node_modules"
                   and not (d == "play" and len(parts) == 1 and rel != ".")
                   and not (rel == "." and d == "push-admin")]
    for name in filenames:
        if not name.endswith(".html"):
            continue
        page = os.path.join(dirpath, name)
        with open(page, encoding="utf-8") as f:
            src = f.read()
        out = attr.sub(lambda m: m.group(1) + asset.sub(lambda a: f"{a.group(1)}?v={rev(a.group(1))}", m.group(2)) + m.group(3), src)
        if out != src:
            (stale if check else changed).append(os.path.relpath(page, root))
            if not check:
                with open(page, "w", encoding="utf-8") as f:
                    f.write(out)

if check:
    if stale:
        print("Stale or missing asset revision stamps:\n  " + "\n  ".join(stale), file=sys.stderr)
        sys.exit(1)
    print("All asset revision stamps are current.")
else:
    print(f"Stamped {len(changed)} page(s)" + (": " + ", ".join(changed) if changed else " (all current)"))
PY

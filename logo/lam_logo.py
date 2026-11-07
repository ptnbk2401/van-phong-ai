#!/usr/bin/env python3
"""Thu nho logo phong (nguon.json: ten thu muc -> anh goc) thanh <thu muc>.png 128x128 cho trang Van phong.

    python3 logo/lam_logo.py      # chay lai khi doi logo

nguon.json va anh ra nam o ~/.config/van-phong-ai/logo/ (doi bang bien VAN_PHONG_CONF);
duong dan anh goc tuong doi theo "goc" trong config.json (hoac tuyet doi).

Dung sips cua macOS (khong can Pillow). Anh goc khong vuong thi cat giua.
"""
import json, os, subprocess, sys

CONF_DIR = os.path.expanduser(os.environ.get("VAN_PHONG_CONF", "~/.config/van-phong-ai"))
HERE = os.path.join(CONF_DIR, "logo")
try:
    ROOT = os.path.expanduser(json.load(open(os.path.join(CONF_DIR, "config.json"), encoding="utf-8")).get("goc") or "")
except (OSError, ValueError):
    ROOT = ""


def sips(*args):
    subprocess.run(["sips", *args], check=True, capture_output=True)


def main():
    with open(os.path.join(HERE, "nguon.json"), encoding="utf-8") as f:
        src = json.load(f)
    for kenh, rel in src.items():
        p = os.path.join(ROOT, os.path.expanduser(rel))
        out = os.path.join(HERE, kenh + ".png")
        if not os.path.isfile(p):
            print("! thieu", rel, file=sys.stderr)
            continue
        info = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", p],
                              capture_output=True, text=True).stdout.split()
        w, h = int(info[-3]), int(info[-1])
        side = min(w, h)
        sips("-s", "format", "png", p, "--out", out)
        if w != h:
            sips("-c", str(side), str(side), out)
        sips("-z", "128", "128", out)
        print("ok", kenh, "%dx%d" % (w, h))


if __name__ == "__main__":
    main()

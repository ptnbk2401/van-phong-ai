#!/usr/bin/env python3
"""Cat to avatar nen xanh (luoi 3x3) thanh tung avatar nen trong cho trang Van phong.

    python3 avatar/cat_avatar.py [thu muc anh to]   # doc to_avatar_nen_xanh-*.png -> avatar/nv_01.png ... nv_18.png

Moi o: tach nen xanh (chroma key + bo vien xanh), lay khung vuong tu dinh dau xuong vai, thu ve 192x192.
Anh to goc giu nguyen.
"""
import glob, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SIZE = 192
GRID = 3


def key_green(rgb):
    """RGB -> RGBA: nen xanh trong suot, vien mem, khu ánh xanh hat len toc/da."""
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    spill = g - np.maximum(r, b)                      # do "xanh hon" mau con lai
    alpha = 1.0 - np.clip((spill - 40) / 70, 0, 1)   # spill <= 40: giu; >= 110: trong
    # khu anh xanh: kep G ve muc cua R/B o vung vien
    g2 = np.where(spill > 0, np.maximum(r, b) + np.clip(spill, 0, 18) * 0.3, g)
    out = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
    return out


def crop_bust(rgba):
    """Khung vuong: tu dinh dau, rong theo khoi nguoi, can giua theo chieu ngang."""
    al = rgba[..., 3] > 40
    rows, cols = np.where(al)
    if not len(rows):
        return None
    top, left, right = rows.min(), cols.min(), cols.max()
    h, w = al.shape
    side = min(w, h - top + 8, max(right - left, int(w * 0.8)))
    cx = (left + right) // 2
    # tam theo khuon mat: dung cot giua cua phan tren (30% chieu cao dau tien)
    upper = al[top: top + max(1, side // 3)]
    uc = np.where(upper.any(axis=0))[0]
    if len(uc):
        cx = (uc.min() + uc.max()) // 2
    x0 = int(np.clip(cx - side // 2, 0, w - side))
    y0 = int(max(0, top - 8))
    return rgba[y0: y0 + side, x0: x0 + side]


def main():
    n = 0
    for sheet in sorted(glob.glob(os.path.join(sys.argv[1] if len(sys.argv) > 1 else HERE, "to_avatar_nen_xanh-*.png"))):
        im = np.asarray(Image.open(sheet).convert("RGB"))
        H, W = im.shape[:2]
        ch, cw = H // GRID, W // GRID
        for i in range(GRID):
            for j in range(GRID):
                cell = key_green(im[i * ch:(i + 1) * ch, j * cw:(j + 1) * cw])
                bust = crop_bust(cell)
                if bust is None:
                    continue
                n += 1
                out = Image.fromarray(bust).resize((SIZE, SIZE), Image.LANCZOS)
                out.save(os.path.join(HERE, "nv_%02d.png" % n), optimize=True)
    print("da cat %d avatar -> %s/nv_XX.png" % (n, HERE))


if __name__ == "__main__":
    main()

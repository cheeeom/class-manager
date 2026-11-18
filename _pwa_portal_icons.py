# -*- coding: utf-8 -*-
"""生成 portal（学生查询端）PWA / apple-touch-icon 满版图标。

为什么不能直接用 icon_512.png：
  源图四角 alpha=0（自带圆角，外面全透明）。
  iOS 的 apple-touch-icon 会自己再套一次圆角，透明角会被合成成白角/黑角 ⇒ 四角出现白牙。
  Android 的 maskable 也要求满版铺底。
  ⇒ 必须先做一张「满版、无透明、无圆角」的底图，再缩各尺寸。

填角做法（第一版踩的坑）：
  直接缩图求平均色会把透明像素的 RGB=0（纯黑）平均进去 ⇒ 四角填成黑色。
  正解 = alpha 加权块平均（只让不透明像素投票），得到真实砖红渐变底，
  再放大回来铺在下面，最后用原 alpha 把真实内容盖回去。接缝不可见。
"""
from PIL import Image, ImageFilter
import numpy as np
import os

SRC = "./icon_512.png"
OUT = "./portal"

TARGETS = [
    ("icon-192.png", 192),
    ("icon-512.png", 512),
    ("apple-touch-icon.png", 180),   # iOS 主屏图标标准尺寸
]

GRID = 16   # 加权平均的块数，必须整除边长


def build_flat():
    src = Image.open(SRC).convert("RGBA")
    arr = np.asarray(src, dtype=np.float64)
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3:4] / 255.0
    H, W = rgb.shape[:2]

    def block(x, n):
        h, w = x.shape[:2]
        return x.reshape(n, h // n, n, w // n, *x.shape[2:]).mean(axis=(1, 3))

    wsum = block(alpha, GRID)                 # 每块的 alpha 总量
    wrgb = block(rgb * alpha, GRID)           # 每块的 alpha 加权色
    bg = wrgb / np.maximum(wsum, 1e-6)        # 只由不透明像素决定的背景色

    # 四角那几块可能整块全透明（圆角半径 ~110px，远大于一块 32px），
    # 这种块算出来是 0/ε ≈ 黑。用邻居有效块迭代扩散取色填平。
    nan_mask = wsum[..., 0] <= 1e-6
    if nan_mask.any():
        bg[nan_mask] = np.nan
        for _ in range(GRID * 2):
            hole = np.isnan(bg[..., 0])
            if not hole.any():
                break
            acc = np.zeros_like(bg)
            cnt = np.zeros(bg.shape[:2])
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1),
                           (-1, -1), (-1, 1), (1, -1), (1, 1)):
                sh = np.roll(bg, (dy, dx), axis=(0, 1))
                ok = ~np.isnan(sh[..., 0])
                acc += np.where(ok[..., None], sh, 0.0)
                cnt += ok
            fill = hole & (cnt > 0)
            if not fill.any():
                break
            bg[fill] = acc[fill] / cnt[fill][:, None]
        assert not np.isnan(bg).any(), "仍有空洞未填"

    bg_img = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8))
    bg_img = bg_img.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(10))

    flat = Image.composite(src, bg_img.convert("RGBA"), src.split()[3])
    return flat


def main():
    flat = build_flat()

    a = flat.split()[3]
    w, h = flat.size
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    for p in corners:
        assert a.getpixel(p) == 255, "四角仍有透明: %s -> %s" % (p, a.getpixel(p))
    cols = [flat.convert("RGB").getpixel(p) for p in corners]
    print("四角不透明 OK, 颜色:", cols)
    # 四角必须是砖红系（R 明显大于 B），否则说明还是被黑色污染
    for c in cols:
        assert c[0] > 80 and c[0] > c[2] + 30, "四角颜色异常（疑似被污染）: %s" % (c,)
    print("四角颜色为砖红系 OK")

    for name, size in TARGETS:
        im = flat.resize((size, size), Image.LANCZOS).convert("RGB")
        path = os.path.join(OUT, name)
        im.save(path, "PNG", optimize=True)
        chk = Image.open(path)
        print("写出 %-22s %s %s %d bytes" % (name, chk.size, chk.mode, os.path.getsize(path)))
        assert chk.size == (size, size) and chk.mode == "RGB"


if __name__ == "__main__":
    main()

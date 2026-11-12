# 生成游戏图标（纯 Python，不需要安装任何库）
# 用法：python tools/make_icons.py
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')


def png(path, w, h, pixels):
    raw = b''.join(b'\x00' + bytes(pixels[y * w * 3:(y + 1) * w * 3]) for y in range(h))

    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)

    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(data)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def draw(size):
    px = [0] * (size * size * 3)
    for y in range(size):
        for x in range(size):
            u = (x + 0.5) / size * 2 - 1
            v = (y + 0.5) / size * 2 - 1
            r = math.hypot(u, v)
            aa = 2.0 / size  # 抗锯齿宽度
            # 背景：暗绿色径向渐变
            col = mix((52, 64, 38), (16, 19, 12), r / 1.3)
            # 丧尸头（方块）
            if abs(u) < 0.36 and -0.42 < v < 0.3:
                col = (122, 154, 86)
                # 红眼睛
                if -0.16 < v < -0.04 and (0.08 < abs(u) < 0.22):
                    col = (255, 64, 48)
                # 嘴
                if 0.1 < v < 0.17 and abs(u) < 0.18:
                    col = (40, 30, 24)
            # 红色准星圆环
            ring = abs(r - 0.68)
            if ring < 0.06:
                col = mix((229, 64, 48), col, (ring - 0.06 + aa) / aa)
            # 准星十字
            if (abs(u) < 0.035 and 0.5 < abs(v) < 0.9) or (abs(v) < 0.035 and 0.5 < abs(u) < 0.9):
                col = (229, 64, 48)
            i = (y * size + x) * 3
            px[i:i + 3] = [int(c) for c in col]
    return px


os.makedirs(OUT, exist_ok=True)
for s in (180, 192, 512):
    png(os.path.join(OUT, f'icon-{s}.png'), s, s, draw(s))
    print('生成', f'icon-{s}.png')

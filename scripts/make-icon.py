"""生成 1024×1024 应用图标（纯标准库，无 PIL）。

设计：蓝底圆角方块 + 白色对勾 —— 32px 下依然清晰，符合"处理完就确认"的语义。
4× 超采样后降采样，得到平滑边缘。
"""
import struct, zlib, math

S = 1024          # 输出尺寸
SS = 4            # 超采样倍数
N = S * SS

CX = CY = N / 2
RADIUS = N * 0.22

# 渐变两端
TOP = (47, 111, 235)     # #2f6feb
BOT = (26, 86, 196)      # #1a56c4


def rounded_rect_alpha(x, y, n, radius):
    """点 (x,y) 在 n×n 圆角矩形内的覆盖率（0/1，超采样下够用）"""
    r = radius
    # 把坐标折到第一象限
    dx = abs(x - n / 2) - (n / 2 - r)
    dy = abs(y - n / 2) - (n / 2 - r)
    if dx <= 0 and dy <= 0:
        return 1.0
    if dx <= 0:
        return 1.0 if abs(y - n / 2) <= n / 2 else 0.0
    if dy <= 0:
        return 1.0 if abs(x - n / 2) <= n / 2 else 0.0
    return 1.0 if dx * dx + dy * dy <= r * r else 0.0


def dist_to_segment(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    L2 = vx * vx + vy * vy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / L2))
    cx, cy = ax + t * vx, ay + t * vy
    return math.hypot(px - cx, py - cy)


# 对勾三个点（相对 N 的比例）
p1 = (0.30 * N, 0.52 * N)
p2 = (0.44 * N, 0.66 * N)
p3 = (0.71 * N, 0.35 * N)
STROKE = 0.082 * N

# 逐像素（超采样）
rows = []
for y in range(N):
    row = bytearray()
    for x in range(N):
        a = rounded_rect_alpha(x + 0.5, y + 0.5, N, RADIUS)
        if a == 0:
            row += b'\x00\x00\x00\x00'
            continue
        # 底色渐变
        t = y / N
        r = int(TOP[0] + (BOT[0] - TOP[0]) * t)
        g = int(TOP[1] + (BOT[1] - TOP[1]) * t)
        b = int(TOP[2] + (BOT[2] - TOP[2]) * t)
        # 对勾（白色，圆头）
        d = min(
            dist_to_segment(x + 0.5, y + 0.5, *p1, *p2),
            dist_to_segment(x + 0.5, y + 0.5, *p2, *p3),
        )
        if d <= STROKE / 2:
            r = g = b = 255
        elif d <= STROKE / 2 + SS:      # 边缘羽化，抵消降采样锯齿
            k = (d - STROKE / 2) / SS
            r = int(r + (255 - r) * (1 - k))
            g = int(g + (255 - g) * (1 - k))
            b = int(b + (255 - b) * (1 - k))
        row += bytes((r, g, b, int(a * 255)))
    rows.append(bytes(row))

# 降采样 SS×SS
out = []
for y in range(S):
    line = bytearray()
    for x in range(S):
        rs = gs = bs = as_ = 0
        for dy in range(SS):
            base = (y * SS + dy) * (N * 4) + x * SS * 4
            src = rows[y * SS + dy]
            for dx in range(SS):
                i = x * SS * 4 + dx * 4
                rs += src[i]; gs += src[i + 1]; bs += src[i + 2]; as_ += src[i + 3]
        k = SS * SS
        line += bytes((rs // k, gs // k, bs // k, as_ // k))
    out.append(bytes(line))

raw = b''.join(b'\x00' + r for r in out)


def chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))


png = (b'\x89PNG\r\n\x1a\n'
       + chunk(b'IHDR', struct.pack('>IIBBBBB', S, S, 8, 6, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(raw, 9))
       + chunk(b'IEND', b''))

open('src-tauri/icon-source.png', 'wb').write(png)
print(f'已生成 src-tauri/icon-source.png  {len(png)/1024:.1f} KB  {S}×{S}')

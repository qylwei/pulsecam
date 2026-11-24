import math
import struct
import zlib
import os


def write_png(path, w, h, pixel_fn):
    def chunk(t, data):
        c = t + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))

    rows = b''
    for y in range(h):
        row = b'\x00'
        for x in range(w):
            row += bytes(pixel_fn(x, y))
        rows += row
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def heartbeat_wave(t):
    base = 0.0
    d = abs(t - 0.45)
    if d < 0.05:
        base = max(base, (0.05 - d) / 0.05)
    d2 = abs(t - 0.18)
    if d2 < 0.04:
        base = max(base, (0.04 - d2) / 0.04 * 0.25)
    d3 = abs(t - 0.72)
    if d3 < 0.06:
        base = max(base, (0.06 - d3) / 0.06 * 0.35)
    return (base - 0.12) * 2


def icon_pixel(x, y, s=1024):
    t = y / s
    bg = (int(42 * (1 - t) + 22 * t), int(36 * (1 - t) + 18 * t), int(29 * (1 - t) + 14 * t))
    cx = cy = s / 2
    d = math.hypot(x - cx, y - cy)
    R = s * 0.37
    th = s * 0.045
    if abs(d - R) < th:
        return (185, 118, 63)
    px = x - cx
    if abs(px) < R * 0.78:
        t0 = (px + R * 0.78) / (2 * R * 0.78)
        pulse = heartbeat_wave(t0) * R * 0.22
        if abs(y - (cy + pulse)) < 4.5:
            return (242, 238, 230)
    return bg


def main():
    out = os.path.join(os.path.dirname(__file__), '..', 'PulseCam', 'Assets.xcassets', 'AppIcon.appiconset', 'icon-1024.png')
    out = os.path.normpath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    write_png(out, 1024, 1024, icon_pixel)
    print('written:', out)


if __name__ == '__main__':
    main()

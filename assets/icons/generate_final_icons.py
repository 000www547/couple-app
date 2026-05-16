#!/usr/bin/env python3
"""生成清晰、高对比度的 TabBar 图标"""
import zlib
import struct
import os

def create_png(width, height, rgba_pixels):
    """创建标准 PNG 文件"""
    def make_chunk(chunk_type, data):
        chunk_len = struct.pack('>I', len(data))
        chunk_crc = struct.pack('>I', zlib.crc32(chunk_type + data) & 0xffffffff)
        return chunk_len + chunk_type + data + chunk_crc

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr = make_chunk(b'IHDR', ihdr_data)

    raw = b''
    for y in range(height):
        raw += b'\x00'
        for x in range(width):
            idx = (y * width + x) * 4
            raw += rgba_pixels[idx:idx+4]

    compressed = zlib.compress(raw, 9)
    idat = make_chunk(b'IDAT', compressed)
    iend = make_chunk(b'IEND', b'')

    return sig + ihdr + idat + iend

def draw_circle_pixels(size, cx, cy, radius, fill_color, bg_color=(0,0,0,0)):
    """绘制圆形区域"""
    pixels = []
    for y in range(size):
        row = []
        for x in range(size):
            dx, dy = x - cx, y - cy
            if dx*dx + dy*dy <= radius*radius:
                row.append(fill_color)
            else:
                row.append(bg_color)
        pixels.append(row)
    return pixels

def create_simple_icon(size, shape_func, color, bg_color=(0,0,0,0)):
    """创建简单形状图标"""
    pixels = bytearray(size * size * 4)
    cx, cy = size // 2, size // 2

    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            inside, col = shape_func(x, y, size, cx, cy)
            if inside:
                pixels[idx:idx+4] = bytes(color + (255,)) if len(color) == 3 else bytes(color)
            else:
                pixels[idx:idx+4] = bytes(bg_color + (0,)) if len(bg_color) == 3 else bytes(bg_color)

    return create_png(size, size, bytes(pixels))

def home_shape(x, y, size, cx, cy):
    """房子形状"""
    s = size
    # 屋顶（三角形）
    roof_peak_y = s * 0.15
    roof_base_y = s * 0.5
    roof_left = s * 0.1
    roof_right = s * 0.9

    if y <= roof_base_y:
        # 计算在三角形内
        t = (y - roof_peak_y) / (roof_base_y - roof_peak_y) if roof_base_y != roof_peak_y else 0
        half_w = (s * 0.4) * t
        if abs(x - cx) <= half_w and y >= roof_peak_y:
            return True, None

    # 墙体（矩形）
    if s * 0.2 <= x <= s * 0.8 and s * 0.45 <= y <= s * 0.9:
        return True, None

    return False, None

def heart_shape(x, y, size, cx, cy):
    """心形"""
    s = size
    # 心形参数方程
    px = (x - cx) / (s * 0.4)
    py = (y - cy * 0.9) / (s * 0.4)

    # 两个圆叠加形成心形
    dx1 = x - cx * 0.75
    dy1 = y - cy * 0.7
    dx2 = x - cx * 1.25
    dy2 = y - cy * 0.7

    r = s * 0.22
    if dx1*dx1 + dy1*dy1 <= r*r or dx2*dx2 + dy2*dy2 <= r*r:
        return True, None

    # 下方三角形
    if y > cy * 0.75:
        # 心形下半部分
        val = (px**2 + (y/s - 0.5)**2 - 1)**3 - px**2 * (y/s - 0.5)**3
        if val <= 0:
            return True, None

    # 简化心形：用圆形和矩形组合
    in_upper_left = (x - cx * 0.72)**2 + (y - cy * 0.72)**2 <= (s * 0.24)**2
    in_upper_right = (x - cx * 1.28)**2 + (y - cy * 0.72)**2 <= (s * 0.24)**2
    in_lower = y >= cy * 0.7 and abs(x - cx) <= (y - cy * 0.7) * 0.8

    if in_upper_left or in_upper_right or in_lower:
        # 进一步裁剪
        if y >= cy * 0.7:
            # 心形底部
            if y <= cy * 1.35 and abs(x - cx) <= (cy * 1.35 - y) * 0.6 + s * 0.05:
                return True, None
        return in_upper_left or in_upper_right, None

    return False, None

def star_shape(x, y, size, cx, cy):
    """星形"""
    s = size
    # 中心圆形
    dx, dy = x - cx, y - cy
    r = s * 0.4
    if dx*dx + dy*dy <= r*r:
        return True, None
    return False, None

def user_shape(x, y, size, cx, cy):
    """用户图标（头+身体）"""
    s = size

    # 头部（圆形）
    head_cx, head_cy = cx, cy * 0.65
    head_r = s * 0.25
    dx, dy = x - head_cx, y - head_cy
    if dx*dx + dy*dy <= head_r*head_r:
        return True, None

    # 身体（半圆形底部）
    body_top = cy * 0.95
    body_bottom = s * 0.9
    if y >= body_top and y <= body_bottom:
        t = (y - body_top) / (body_bottom - body_top)
        half_w = s * 0.3 * t
        if abs(x - cx) <= half_w:
            return True, None

    return False, None

def more_shape(x, y, size, cx, cy):
    """更多图标（三个点）"""
    s = size
    dot_r = s * 0.1
    dot_spacing = s * 0.3

    # 三个圆点，垂直排列
    for i, dy_offset in enumerate([-0.4, 0, 0.4]):
        dot_cy = cy + cy * dy_offset
        dx = x - cx
        dy = y - dot_cy
        if dx*dx + dy*dy <= dot_r*dot_r:
            return True, None

    return False, None

def main():
    out_dir = os.path.dirname(os.path.abspath(__file__))
    size = 81  # 微信小程序标准 TabBar 图标尺寸

    print(f"Generating {size}x{size} icons...")

    icons_config = [
        # (filename, shape_func, color_rgb, is_active)
        ('home.png', home_shape, (153, 153, 153), False),
        ('home-active.png', home_shape, (255, 182, 193), True),  # 粉色
        ('heart.png', heart_shape, (153, 153, 153), False),
        ('heart-active.png', heart_shape, (255, 182, 193), True),
        ('star.png', star_shape, (153, 153, 153), False),
        ('star-active.png', star_shape, (255, 182, 193), True),
        ('user.png', user_shape, (153, 153, 153), False),
        ('user-active.png', user_shape, (255, 182, 193), True),
        ('more.png', more_shape, (153, 153, 153), False),
        ('more-active.png', more_shape, (255, 182, 193), True),
    ]

    for filename, shape_func, color, is_active in icons_config:
        filepath = os.path.join(out_dir, filename)
        png_data = create_simple_icon(size, shape_func, color)
        with open(filepath, 'wb') as f:
            f.write(png_data)
        print(f"  Created {filename} ({len(png_data)} bytes)")

    print("\nIcon generation complete!")
    
    # Verify
    print("\nVerification:")
    for f in sorted(os.listdir(out_dir)):
        if f.endswith('.png') and not f.startswith('generate') and not f.startswith('verify'):
            path = os.path.join(out_dir, f)
            fsize = os.path.getsize(path)
            print(f"  {f}: {fsize} bytes")

if __name__ == '__main__':
    main()

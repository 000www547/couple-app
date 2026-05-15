#!/usr/bin/env python3
"""Generate TabBar icons for WeChat Mini Program"""

import base64
import os

# Simple 81x81 PNG icons in base64
# These are minimal PNG files with solid colors

def create_simple_png(color_hex, size=81):
    """Create a simple colored PNG icon"""
    import struct
    import zlib
    
    def png_chunk(chunk_type, data):
        chunk = struct.pack('>I', len(data)) + chunk_type + data
        crc = zlib.crc32(chunk_type + data) & 0xffffffff
        return chunk + struct.pack('>I', crc)
    
    # Parse color
    r = int(color_hex[1:3], 16)
    g = int(color_hex[3:5], 16)
    b = int(color_hex[5:7], 16)
    
    # Create raw image data (RGB)
    raw_data = b''
    for y in range(size):
        raw_data += b'\x00'  # filter byte
        for x in range(size):
            # Create a simple circle shape
            cx, cy = size // 2, size // 2
            radius = size // 2 - 5
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if dist <= radius:
                raw_data += bytes([r, g, b])
            else:
                raw_data += bytes([255, 255, 255])  # white background
    
    compressed = zlib.compress(raw_data, 9)
    
    png = b'\x89PNG\r\n\x1a\n'
    png += png_chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += png_chunk(b'IDAT', compressed)
    png += png_chunk(b'IEND', b'')
    
    return png

def create_home_icon(color, active=False):
    """Create home icon - house shape"""
    import struct
    import zlib
    
    def png_chunk(chunk_type, data):
        chunk = struct.pack('>I', len(data)) + chunk_type + data
        crc = zlib.crc32(chunk_type + data) & 0xffffffff
        return chunk + struct.pack('>I', crc)
    
    size = 81
    r = int(color[1:3], 16)
    g = int(color[3:5], 16)
    b = int(color[5:7], 16)
    
    raw_data = b''
    for y in range(size):
        raw_data += b'\x00'
        for x in range(size):
            # Simple house shape
            # Roof (triangle)
            roof_y = 20
            roof_height = 25
            roof_left = 10
            roof_right = 70
            roof_top = roof_y
            roof_bottom = roof_y + roof_height
            
            # House body
            body_left = 18
            body_right = 62
            body_top = 40
            body_bottom = 70
            
            # Door
            door_left = 35
            door_right = 45
            door_top = 50
            door_bottom = 70
            
            in_roof = (y >= roof_top and y <= roof_bottom and 
                      abs(x - 40) <= (40 - (y - roof_top) * 0.7))
            in_body = (x >= body_left and x <= body_right and 
                      y >= body_top and y <= body_bottom)
            in_door = (x >= door_left and x <= door_right and 
                      y >= door_top and y <= door_bottom)
            
            if in_roof or (in_body and not in_door):
                raw_data += bytes([r, g, b])
            else:
                raw_data += bytes([255, 255, 255])
    
    compressed = zlib.compress(raw_data, 9)
    
    png = b'\x89PNG\r\n\x1a\n'
    png += png_chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += png_chunk(b'IDAT', compressed)
    png += png_chunk(b'IEND', b'')
    
    return png

def create_heart_icon(color, active=False):
    """Create heart icon"""
    import struct
    import zlib
    
    def png_chunk(chunk_type, data):
        chunk = struct.pack('>I', len(data)) + chunk_type + data
        crc = zlib.crc32(chunk_type + data) & 0xffffffff
        return chunk + struct.pack('>I', crc)
    
    size = 81
    r = int(color[1:3], 16)
    g = int(color[3:5], 16)
    b = int(color[5:7], 16)
    
    raw_data = b''
    for y in range(size):
        raw_data += b'\x00'
        for x in range(size):
            # Heart shape
            cx, cy = size // 2, size // 2
            nx = (x - 20) / 20
            ny = (y - 25) / 18
            
            # Left circle
            d1 = ((nx - 0.5) ** 2 + (ny - 0.3) ** 2) ** 0.5
            # Right circle  
            d2 = ((nx + 0.5) ** 2 + (ny - 0.3) ** 2) ** 0.5
            # Bottom triangle part
            in_tri = ny > -1.2 and ny < 0.5 and abs(nx) < (0.5 - (ny + 0.3) * 0.6)
            
            if d1 < 0.7 or d2 < 0.7 or in_tri:
                raw_data += bytes([r, g, b])
            else:
                raw_data += bytes([255, 255, 255])
    
    compressed = zlib.compress(raw_data, 9)
    
    png = b'\x89PNG\r\n\x1a\n'
    png += png_chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += png_chunk(b'IDAT', compressed)
    png += png_chunk(b'IEND', b'')
    
    return png

def create_star_icon(color, active=False):
    """Create star icon"""
    import struct
    import zlib
    import math
    
    def png_chunk(chunk_type, data):
        chunk = struct.pack('>I', len(data)) + chunk_type + data
        crc = zlib.crc32(chunk_type + data) & 0xffffffff
        return chunk + struct.pack('>I', crc)
    
    size = 81
    r = int(color[1:3], 16)
    g = int(color[3:5], 16)
    b = int(color[5:7], 16)
    
    raw_data = b''
    cx, cy = size // 2, size // 2
    outer_r = 35
    inner_r = 15
    points = 5
    
    def point_on_star(angle, radius):
        return cx + radius * math.cos(angle), cy + radius * math.sin(angle)
    
    def in_star(px, py):
        angles = []
        for i in range(points * 2):
            angle = math.pi / 2 + i * math.pi / points
            radius = outer_r if i % 2 == 0 else inner_r
            angles.append(point_on_star(angle, radius))
        
        # Ray casting algorithm
        inside = False
        j = len(angles) - 1
        for i in range(len(angles)):
            xi, yi = angles[i]
            xj, yj = angles[j]
            if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
                inside = not inside
            j = i
        return inside
    
    for y in range(size):
        raw_data += b'\x00'
        for x in range(size):
            if in_star(x, y):
                raw_data += bytes([r, g, b])
            else:
                raw_data += bytes([255, 255, 255])
    
    compressed = zlib.compress(raw_data, 9)
    
    png = b'\x89PNG\r\n\x1a\n'
    png += png_chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += png_chunk(b'IDAT', compressed)
    png += png_chunk(b'IEND', b'')
    
    return png

def create_user_icon(color, active=False):
    """Create user icon - simple person silhouette"""
    import struct
    import zlib
    
    def png_chunk(chunk_type, data):
        chunk = struct.pack('>I', len(data)) + chunk_type + data
        crc = zlib.crc32(chunk_type + data) & 0xffffffff
        return chunk + struct.pack('>I', crc)
    
    size = 81
    r = int(color[1:3], 16)
    g = int(color[3:5], 16)
    b = int(color[5:7], 16)
    
    raw_data = b''
    for y in range(size):
        raw_data += b'\x00'
        for x in range(size):
            # Head (circle)
            head_cx, head_cy = 40, 22
            head_r = 12
            head_dist = ((x - head_cx) ** 2 + (y - head_cy) ** 2) ** 0.5
            
            # Body (rounded rectangle)
            body_left = 25
            body_right = 55
            body_top = 38
            body_bottom = 70
            
            # Shoulders (rounded)
            shoulder_y = 42
            shoulder_r = 18
            
            in_head = head_dist <= head_r
            in_body = (x >= body_left and x <= body_right and y >= body_top and y <= body_bottom)
            in_shoulder = (((x - 25) ** 2 + (y - shoulder_y) ** 2) ** 0.5 <= shoulder_r or
                          ((x - 55) ** 2 + (y - shoulder_y) ** 2) ** 0.5 <= shoulder_r)
            
            if in_head or in_body or in_shoulder:
                raw_data += bytes([r, g, b])
            else:
                raw_data += bytes([255, 255, 255])
    
    compressed = zlib.compress(raw_data, 9)
    
    png = b'\x89PNG\r\n\x1a\n'
    png += png_chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    png += png_chunk(b'IDAT', compressed)
    png += png_chunk(b'IEND', b'')
    
    return png

def main():
    icons_dir = r'D:\ClaudeDev\couple-app\assets\icons'
    
    # Colors
    inactive_color = '#999999'  # Gray for inactive
    active_color = '#FFB6C1'   # Pink for active (selected)
    
    # Generate icons
    icons = [
        ('home', create_home_icon),
        ('heart', create_heart_icon),
        ('star', create_star_icon),
        ('user', create_user_icon),
    ]
    
    for name, creator in icons:
        # Inactive icon
        png_data = creator(inactive_color)
        with open(os.path.join(icons_dir, f'{name}.png'), 'wb') as f:
            f.write(png_data)
        print(f'Created {name}.png')
        
        # Active icon
        png_data = creator(active_color)
        with open(os.path.join(icons_dir, f'{name}-active.png'), 'wb') as f:
            f.write(png_data)
        print(f'Created {name}-active.png')
    
    print('Done!')

if __name__ == '__main__':
    main()

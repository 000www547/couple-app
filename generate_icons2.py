#!/usr/bin/env python3
"""Generate TabBar icons using PIL/Pillow"""

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Pillow not installed. Installing...")
    import subprocess
    subprocess.check_call(['pip', 'install', 'Pillow'])
    from PIL import Image, ImageDraw

import os

def create_icon(filename, shape, color, active=False):
    """Create an icon with the specified shape and color"""
    size = 81
    img = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)
    
    r = int(color[1:3], 16)
    g = int(color[3:5], 16)
    b = int(color[5:7], 16)
    
    if shape == 'home':
        # Draw house
        # Roof (triangle)
        draw.polygon([(10, 40), (40, 15), (70, 40)], fill=(r, g, b))
        # Body
        draw.rectangle([(20, 40), (60, 70)], fill=(r, g, b))
        # Door
        draw.rectangle([(34, 50), (46, 70)], fill=(255, 255, 255))
        
    elif shape == 'heart':
        # Draw heart using bezier-like approach
        # Left circle
        draw.ellipse([(18, 20), (40, 42)], fill=(r, g, b))
        # Right circle
        draw.ellipse([(40, 20), (62, 42)], fill=(r, g, b))
        # Bottom triangle part
        draw.polygon([(18, 30), (62, 30), (40, 65)], fill=(r, g, b))
        
    elif shape == 'star':
        # Draw 5-pointed star
        cx, cy = size // 2, size // 2
        outer_r = 35
        inner_r = 15
        points = []
        for i in range(10):
            angle = 3.14159 / 2 + i * 3.14159 / 5
            r_val = outer_r if i % 2 == 0 else inner_r
            x = cx + r_val * np.cos(angle) if i < 10 else cx + r_val * np.cos(angle)
            y = cy - r_val * np.sin(angle)  # Use numpy-like approach
            points.append((cx + r_val * np.cos(3.14159/2 + i * 3.14159 / 5),
                          cy - r_val * np.sin(3.14159/2 + i * 3.14159 / 5)))
        # Recalculate properly
        points = []
        import math
        for i in range(10):
            angle = math.pi / 2 + i * math.pi / 5
            r_val = outer_r if i % 2 == 0 else inner_r
            x = cx + r_val * math.cos(angle)
            y = cy - r_val * math.sin(angle)
            points.append((x, y))
        draw.polygon(points, fill=(r, g, b))
        
    elif shape == 'user':
        # Draw person silhouette
        # Head
        draw.ellipse([(30, 12), (50, 32)], fill=(r, g, b))
        # Body/shoulders
        draw.ellipse([(20, 42), (60, 60)], fill=(r, g, b))
        # Body bottom
        draw.rectangle([(25, 50), (55, 70)], fill=(r, g, b))
    
    # Convert to white background (for non-transparent display)
    background = Image.new('RGB', img.size, (255, 255, 255))
    background.paste(img, mask=img.split()[3])  # Use alpha as mask
    img = background
    
    img.save(filename, 'PNG')
    print(f'Created {filename} ({os.path.getsize(filename)} bytes)')

def main():
    import math
    import numpy as np
    
    icons_dir = r'D:\ClaudeDev\couple-app\assets\icons'
    
    inactive_color = '#999999'  # Gray
    active_color = '#FFB6C1'    # Pink
    
    shapes = ['home', 'heart', 'star', 'user']
    
    for shape in shapes:
        # Inactive
        create_icon(os.path.join(icons_dir, f'{shape}.png'), shape, inactive_color)
        # Active
        create_icon(os.path.join(icons_dir, f'{shape}-active.png'), shape, active_color, active=True)
    
    print('\nAll icons created successfully!')

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Generate pixel-art pet SVGs for WeChat mini-program.
Characters:
  . = transparent
  K = black (outline, pupils)
  W = white (body fill, eye white)
  G = gray/blush
  E = coral (dog body/ears)
  I = dark coral (dog ear inner)
  B = pink (nose)
  M = dark gray (mouth)
  T = teal (tears)
  P = pink (rabbit body)
  R = deep pink (rabbit inner ear)
  N = light pink (rabbit belly)
  Y = light blue (feet/accent)
"""

import os

C = {
    '.': None,
    'K': '#1A1A1A',   # black outline / pupils
    'W': '#FFFFFF',     # white body / eye-white
    'G': '#E0E0E0',   # gray blush
    'E': '#E8987A',    # coral dog body
    'I': '#D4856A',    # dark coral inner ear
    'B': '#FFB6C1',   # pink nose
    'M': '#333333',     # dark mouth
    'T': '#4ECDC4',    # teal tears
    'P': '#F5C4D1',    # pink rabbit body
    'R': '#ED93B1',    # deep pink rabbit inner ear
    'N': '#FAD4DF',    # light pink rabbit belly
    'Y': '#87CEEB',    # light blue accent
}

PIXEL_SIZE = 10


def grid_to_svg(grid, name):
    rows = [r for r in grid.strip().split('\n') if r.strip()]
    height = len(rows)
    width = max(len(r) for r in rows)

    vb_w = width * PIXEL_SIZE
    vb_h = height * PIXEL_SIZE

    rects = []
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            color = C.get(ch)
            if color:
                px = x * PIXEL_SIZE
                py = y * PIXEL_SIZE
                rects.append(
                    f'  <rect x="{px}" y="{py}" width="{PIXEL_SIZE}" height="{PIXEL_SIZE}" fill="{color}"/>'
                )

    svg = f'''<svg viewBox="0 0 {vb_w} {vb_h}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
{chr(10).join(rects)}
</svg>'''
    return svg


def write_svg(filename, grid):
    path = os.path.join(os.path.dirname(__file__), 'assets', 'pets', filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(grid_to_svg(grid, filename))
    print(f"Generated: {path}")


# ============================================================
# DOG - coral body, 14x14 grid
# ============================================================

dog_happy = '''
....KK....KK..
...KKKK..KKKK.
..WWKKWWWWKKWW..
.KWWWWWWWWWWWWK.
.KWWGWWWWWWGWWK.
.KWWGWWWWWWGWWK.
.KWWWWKK..KKWWWWK.
.KWWWWWWWWWWWWWWK.
.KWWWWBB....BBWWK.
.KWWWWWWMMWWWWWWK.
.KWWWWWWWWWWWWWWK.
..KWWWWWWWWWWWWK..
...WWKKWWWWKKWW...
....KKKK....KKKK....
...KKKK....KKKK......
..KKKK........KKKK........
..KKKK........KKKK........
...KKKK........KKKK..........
....KKKK............KKKK............
.....KKKK............KKKK..............
.....YYYY............YYYY..............
.....YYYY............YYYY..............
'''

dog_normal = '''
....KK....KK..
...KKKK..KKKK.
..WWKKWWWWKKWW..
.KWWWWWWWWWWWWK.
.KWWGWWWWWWGWWK.
.KWWGWWWWWWGWWK.
.KWWWWKK.WW..WWWWK.
.KWWWWWW..WWWWWWK.
.KWWWWBB....BBWWWWK.
.KWWWWWWMMWWWWWWK.
.KWWWWWWWWWWWWWWK.
..KWWWWWWWWWWWWK..
...WWKKWWWWKKWW...
....KKKK....KKKK....
...KKKK....KKKK......
..KKKK........KKKK........
..KKKK........KKKK........
...KKKK........KKKK..........
....KKKK....KKKK........
.....KKKK........KKKK..........
.....YYYY............YYYY..............
.....YYYY............YYYY..............
'''

dog_sad = '''
....KK....KK..
...KKKK..KKKK.
..WWKKWWWWKKWW..
.KWWWWWWWWWWWWK.
.KWWGWWWWWWGWWK.
.KWWGWWWWWWGWWK.
.KWWWWKK.WW..WWWWK.
.KWWWWKK.WW..WWWWK.
.KWWWWKK.WW..WWWWK.
.KWWWWBB....BBWWWWK.
.KWWWWWWMMWWWWWWK.
..KWWWWWWWWWWWWK..
...WWKKWWWWKKWW...
....KKKK....KKKK....
...KKKK....KKKK......
..KKKK........KKKK........
..KKKK........KKKK........
...KKKK........KKKK..........
....KKKK....KKKK........
.....KKKK........KKKK............
.....YYYY............YYYY..............
.....YYYY............YYYY..............
'''

dog_crying = '''
....KK....KK..
...KKKK..KKKK.
..WWKKWWWWKKWW..
.KWWWWWWWWWWWWK.
.KWWGWWWWWWGWWK.
.KWWGWWWWWWGWWK.
.KWWWWKK.WW..WWWWK.
.KWWWWKK.WW..WWWWK.
.KWWWWKK.WW..WWWWK.
.KWWWWBB....BBWWWWK.
.KWWWWWWMMWWWWWWK.
.KWWWWKT..T..WWWWK.
..KWWWWKT..T..WWWWK..
...WWKKWWWWKKWW...
....KKKK....KKKK....
...KKKK....KKKK......
..KKKK........KKKK........
..KKKK........KKKK........
...KKKK........KKKK..........
....KKKK....KKKK........
.....KKKK........KKKK............
.....YYYY............YYYY..............
.....YYYY............YYYY..............
'''


# ============================================================
# RABBIT - pink body, 15x16 grid — FACE ENLARGED
# ============================================================

# Happy rabbit: ^ ^  eyes, open mouth
rabbit_happy = '''
...RR........RP..
...RR........RP..
...RR........RP..
...RR........RP..
...RK........KP..
..WWKK........KKWW..
.KWWWWWWWWWWWWWWWWK.
.KWWGWWWWWWWWGWWK.
.KWWGWWWWWWWWGWWK.
.KWWWWKK....KKWWWWK.
.KWWWWWWWWWWWWWWWWK.
.KWWWWBB....BBWWWWK.
.KWWWWWWMMWWWWWWWWK.
.KWWWWWWWWWWWWWWWWK.
..KWWWWWWWWWWWWWWK..
...WWKK........KKWW...
....PPPPPPPP...........
...PPPPPPPPPP.............
..PPPPPPPPPPPP................
..PPPPPPPPPPPP................
...PPPPPPPPPP.............
....PPPPPPPP...........
.....YYYY................
.....YYYY................
'''

# Normal rabbit: o o eyes
rabbit_normal = '''
...RR........RP..
...RR........RP..
...RR........RP..
...RR........RP..
...RK........KP..
..WWKK........KKWW..
.KWWWWWWWWWWWWWWWWK.
.KWWGWWWWWWWWGWWK.
.KWWGWWWWWWWWGWWK.
.KWWWWKK.WW..WWWWWWK.
.KWWWWWW..WWWWWWWWK.
.KWWWWBB....BBWWWWK.
.KWWWWWWMMWWWWWWWWK.
.KWWWWWWWWWWWWWWWWK.
..KWWWWWWWWWWWWWWK..
...WWKK........KKWW...
....PPPPPPPP...........
...PPPPPPPPPP.............
..PPPPPPPPPPPP................
..PPPPPPPPPPPP................
...PPPPPPPPPP.............
....PPPPPPPP...........
.....YYYY................
.....YYYY................
'''

# Sad rabbit: - - eyes
rabbit_sad = '''
...RR........RP..
...RR........RP..
...RR........RP..
...RR........RP..
...RK........KP..
..WWKK........KKWW..
.KWWWWWWWWWWWWWWWWK.
.KWWGWWWWWWWWGWWK.
.KWWGWWWWWWWWGWWK.
.KWWWWKK.WW..WWWWWWK.
.KWWWWKK.WW..WWWWWWK.
.KWWWWKK.WW..WWWWWWK.
.KWWWWBB....BBWWWWK.
.KWWWWWWMMWWWWWWWWK.
.KWWWWWWWWWWWWWWWWK.
..KWWWWWWWWWWWWWWK..
...WWKK........KKWW...
....PPPPPPPP...........
...PPPPPPPPPP.............
..PPPPPPPPPPPP................
..PPPPPPPPPPPP................
...PPPPPPPPPP.............
....PPPPPPPP...........
.....YYYY................
.....YYYY................
'''

# Crying rabbit: ; ; eyes + tears
rabbit_crying = '''
...RR........RP..
...RR........RP..
...RR........RP..
...RR........RP..
...RK........KP..
..WWKK........KKWW..
.KWWWWWWWWWWWWWWWWK.
.KWWGWWWWWWWWGWWK.
.KWWGWWWWWWWWGWWK.
.KWWWWKK.WW..WWWWWWK.
.KWWWWKK.WW..WWWWWWK.
.KWWWWKK.WW..WWWWWWK.
.KWWWWBB....BBWWWWK.
.KWWWWWWMMWWWWWWWWK.
.KWWWWKT..T..WWWWK.
..KWWWWKT..T..WWWWK..
...WWKK........KKWW...
....PPPPPPPP...........
...PPPPPPPPPP.............
..PPPPPPPPPPPP................
..PPPPPPPPPPPP................
...PPPPPPPPPP.............
....PPPPPPPP...........
.....YYYY................
.....YYYY................
'''


# Selection screen versions (simpler)
dog_select = '''
..KK....KK..
.WWKKWWWWKKWW.
.KWWWWWWWWWWK.
.KWWGWWWWWWGK.
.KWWWWKK..KKWWK.
.KWWWWBB....BBK.
.KWWWWWWMMWWWWK.
.KWWWWWWWWWWK.
..KKKKKKKK........
...KKKKKK..........
....TTTT............
'''

rabbit_select = '''
..RR....RP..
..RR....RP..
.WWKK........KKWW..
.KWWWWWWWWWWWWK.
.KWWGWWWWWWGK.
.KWWWWKK..KKWWK.
.KWWWWBB....BBK.
.KWWWWWWMMWWWWK.
.KWWWWWWWWWWK.
..PPPPPPPP........
...PPPPPP..........
....YYYY............
'''


if __name__ == '__main__':
    write_svg('dog-happy.svg', dog_happy)
    write_svg('dog-normal.svg', dog_normal)
    write_svg('dog-sad.svg', dog_sad)
    write_svg('dog-crying.svg', dog_crying)

    write_svg('rabbit-happy.svg', rabbit_happy)
    write_svg('rabbit-normal.svg', rabbit_normal)
    write_svg('rabbit-sad.svg', rabbit_sad)
    write_svg('rabbit-crying.svg', rabbit_crying)

    write_svg('dog-select.svg', dog_select)
    write_svg('rabbit-select.svg', rabbit_select)

    print("\nAll pet SVGs generated!")

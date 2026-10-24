"""主页：山河入梦 —— 72 拍，D 宫五声（借 B 羽的忧伤），24 小节一循环
   前奏 4 小节（古筝分解和弦、风声、钟），A 段 8 小节笛子主题，B 段 8 小节二胡接唱、合唱和鼓进来，尾声 4 小节回到前奏。
   和声是古风常用的 4-5-3-6（G A F#m Bm），旋律只用五声音阶。"""
import numpy as np
import mixlib as mx
from song import Song, N, chord, line, arp, block, swell

def build():
    s = Song('menu', 72, 24, seed=11)
    hum = lambda b: s.hum(b, 0.008)
    # ---------- 声部 ----------
    zheng = s.part('zheng', 107, gain=-2, pan=-0.35, eq=[('hp', 90), ('peak', 2800, 1.5, 1.2), ('hs', 8000, 1.5)], rev='plate', send=0.28)
    harp = s.part('harp', 46, gain=3, pan=0.45, eq=[('hp', 120)], rev='hall', send=0.35)
    dizi = s.part('dizi', 73, bank=17, expr=96, gain=-4, pan=0.1, eq=[('hp', 250), ('peak', 3200, 1.5, 1.0)], rev='hall', send=0.34)
    erhu = s.part('erhu', 40, bank=17, expr=90, gain=-1.5, pan=-0.12, eq=[('hp', 180), ('peak', 1400, 2.5, 0.9), ('peak', 350, -2, 1), ('lp', 9000)], rev='hall', send=0.32)
    vln = s.part('vlnpad', 49, bank=21, expr=70, gain=-6, pan=-0.3, eq=[('hp', 150), ('lp', 9000)], rev='hall', send=0.35)
    vla = s.part('vlapad', 49, bank=31, expr=70, gain=-7, pan=0.25, eq=[('hp', 120), ('lp', 7000)], rev='hall', send=0.35)
    cello = s.part('cello', 49, bank=41, expr=78, gain=-2.5, pan=0.3, eq=[('hp', 50), ('lp', 6000)], rev='hall', send=0.28)
    bass = s.part('bass', 49, bank=51, expr=74, gain=-2, pan=0.15, eq=[('hp', 32), ('lp', 2500)], rev='hall', send=0.18)
    choir = s.part('choir', 52, bank=17, expr=64, gain=-4, width=1.3, eq=[('hp', 200), ('lp', 8000)], rev='hall', send=0.45)
    bell = s.part('bell', 14, gain=1, pan=0.2, eq=[('hp', 300)], rev='hall', send=0.5)
    celesta = s.part('celesta', 8, gain=-1, pan=0.4, eq=[('hp', 400)], rev='hall', send=0.5)
    taiko = s.part('taiko', 116, gain=-1, eq=[('hp', 35), ('lp', 5000)], rev='hall', send=0.22)
    timp = s.part('timp', 47, gain=-3, pan=-0.1, eq=[('hp', 40)], rev='hall', send=0.25)
    kit = s.part('kit', 48, drum=True, gain=0, eq=[('hp', 200)], rev='hall', send=0.35)

    # ---------- 和声 ----------
    prog = ['Bm', 'G', 'D/F#', 'Asus', 'G', 'A', 'F#m', 'Bm', 'G', 'A', 'Bm', 'Bm',
            'Em', 'A', 'D', 'Bm', 'G', 'A', 'F#m', 'Bm', 'G', 'A', 'Bm', 'Bm']
    V = {  # 低音, 弦乐中声部（三个音）, 古筝分解用的五声音组
        'Bm': ('B1', 'D4 F#4 B4', 'B2 F#3 B3 C#4 D4 F#4 A4 B4'),
        'G': ('G1', 'D4 G4 B4', 'G2 D3 G3 A3 B3 D4 E4 G4'),
        'D/F#': ('F#1', 'D4 F#4 A4', 'F#2 D3 A3 B3 D4 E4 F#4 A4'),
        'Asus': ('A1', 'D4 E4 A4', 'A2 E3 A3 B3 D4 E4 A4 B4'),
        'A': ('A1', 'C#4 E4 A4', 'A2 E3 A3 B3 C#4 E4 F#4 A4'),
        'F#m': ('F#1', 'C#4 F#4 A4', 'F#2 C#3 F#3 A3 B3 C#4 E4 F#4'),
        'Em': ('E1', 'B3 E4 G4', 'E2 B2 E3 F#3 G3 B3 D4 E4'),
        'D': ('D2', 'D4 F#4 A4', 'D2 A2 D3 E3 F#3 A3 B3 D4'),
    }
    rng = np.random.default_rng(3)
    for bar, c in enumerate(prog):
        b0 = bar * 4; lo, mid, ar = V[c]; ar = chord(ar); mid = chord(mid)
        sec = 'intro' if bar < 4 else 'A' if bar < 12 else 'B' if bar < 20 else 'out'
        # 古筝：前奏和 A 段八分音符上行再回落；B 段十六分音符流动；尾声慢下来
        if sec == 'B':
            pat = [0, 2, 4, 5, 6, 7, 6, 5, 3, 4, 5, 6, 7, 6, 4, 2]
            arp(zheng, b0, ar, pat, 0.25, dur=0.6, vel=70, accent=[10, 0, 2, 0], hum=hum, rng=rng)
        elif sec == 'out' and bar >= 22:
            arp(zheng, b0, ar, [0, 2, 4, 6, 7, 6, 4, 2], 0.5, dur=1.6, vel=62 - (bar - 22) * 6, accent=[8, 0], hum=hum, rng=rng)
        else:
            arp(zheng, b0, ar, [0, 2, 4, 6, 7, 6, 5, 3], 0.5, dur=1.4, vel=66 if sec == 'intro' else 70, accent=[10, 0, 3, 0], hum=hum, rng=rng)
        # 弦乐长音（前奏只有中提琴一层）
        if sec != 'intro' or bar >= 2:
            block(vla, b0, mid[:2], 4.0, 62)
        if sec in ('A', 'B', 'out'):
            block(vln, b0, [mid[2] + 12 if sec == 'B' else mid[2]], 4.0, 60)
        # 低音
        if sec in ('A', 'B'):
            bass.note(b0, 3.9, N(lo), 70)
        if sec == 'B' or (sec == 'A' and bar % 2 == 0) or sec == 'out':
            cello.note(b0, 3.9 if sec != 'B' else 1.9, N(lo) + 12, 72)
            if sec == 'B': cello.note(b0 + 2, 1.9, N(lo) + 19, 66)
        if sec == 'intro' and bar < 2: cello.note(b0, 3.9, N(lo) + 12, 60)
        # 合唱：B 段
        if sec == 'B':
            block(choir, b0, mid, 4.0, 60)
    # 强弱：弦乐 B 段推上去，尾声收
    swell(vla, 0, 8, 50, 76); swell(vla, 48, 80, 76, 96); swell(vla, 80, 96, 96, 60)
    swell(vln, 16, 48, 60, 78); swell(vln, 48, 76, 78, 100); swell(vln, 76, 96, 100, 55)
    swell(cello, 0, 16, 60, 80); swell(cello, 48, 80, 80, 100); swell(cello, 80, 96, 90, 62)
    swell(bass, 16, 48, 66, 80); swell(bass, 48, 80, 80, 96)
    swell(choir, 48, 52, 30, 70); swell(choir, 52, 76, 70, 92); swell(choir, 76, 80, 92, 40)

    # ---------- 旋律 ----------
    # A 段：笛子（第 5–12 小节）
    A1 = 'F#5:0.5 A5:0.5 B5:1.5 A5:0.5 B5:0.5 D6:0.5 ~A5:2 F#5:0.5 E5:0.5 F#5:1 E5:0.5 F#5:0.5 A5:1 F#5:0.5 E5:0.5 D5:1 /B4:3 r:1'
    A2 = 'F#5:0.5 A5:0.5 B5:1.5 D6:0.5 E6:0.5 F#6:0.5 ~E6:1.5 D6:0.5 B5:1 A5:1 B5:1 A5:0.5 F#5:0.5 E5:1 F#5:1 ~B5:2.5 A5:0.5 B5:0.5 D6:0.5'
    line(dizi, 16, A1 + ' ' + A2, vel=84, vib=0.18, hum=hum)
    swell(dizi, 16, 18, 70, 96); swell(dizi, 28, 31, 96, 70); swell(dizi, 32, 34, 80, 104); swell(dizi, 44, 47.5, 104, 84)
    # B 段：二胡（第 13–20 小节），低一个八度，滑音多
    B = 'B4:1 D5:0.5 E5:0.5 ~F#5:1.5 E5:0.5 D5:0.5 E5:0.5 B4:1 ≈A4:2 F#4:0.5 A4:0.5 B4:1 D5:1 ≈E5:1 ~F#5:3 E5:0.5 D5:0.5 ' \
        'B4:1.5 D5:0.5 E5:1 F#5:0.5 A5:0.5 ~≈B5:2 A5:1 F#5:1 E5:0.5 F#5:0.5 A5:1 ≈F#5:1 E5:1 ~≈B4:4'
    line(erhu, 48, B, vel=86, slide=0.18, vib=0.3, vib_hz=5.8, hum=hum)
    swell(erhu, 48, 50, 60, 92); swell(erhu, 50, 70, 92, 108); swell(erhu, 70, 76, 112, 96); swell(erhu, 76, 80, 96, 50)
    # B 段笛子在句尾应答
    line(dizi, 59, 'A5:0.5 B5:0.5 D6:2', vel=70, hum=hum); line(dizi, 67, 'E6:0.5 F#6:0.5 ~E6:2', vel=72, hum=hum)
    swell(dizi, 58, 62, 60, 80); swell(dizi, 66, 70, 62, 84)
    # 尾声：笛子把主题头轻轻吹一遍
    line(dizi, 80, 'F#5:0.5 A5:0.5 ~B5:3 A5:0.5 F#5:0.5 ~E5:3 r:1 /B4:4', vel=70, hum=hum)
    swell(dizi, 80, 82, 60, 82); swell(dizi, 88, 92, 80, 52)

    # ---------- 点缀 ----------
    for b in (0, 16, 32, 80):
        bell.note(b, 4, N('B5'), 62); bell.note(b + 0.02, 4, N('F#6'), 48)
    for b in (8, 24, 40, 72, 88):
        line(celesta, b + 2, 'B6:0.5 A6:0.5 F#6:0.5 E6:0.5', vel=58)
    # 竖琴：段落交界处的刮奏
    def gliss(p, beat, lo, hi, dur, vel=64, notes='D E F# A B'):
        pcs = [N(x + '0') % 12 for x in notes.split()]
        seq = [n for n in range(N(lo), N(hi) + 1) if n % 12 in pcs]
        for i, n in enumerate(seq): p.note(beat + dur * i / len(seq), 1.5, n, vel + i // 3)
    gliss(harp, 46, 'B3', 'B5', 1.6, 58); gliss(harp, 78, 'D4', 'D6', 1.6, 58); gliss(zheng, 94.5, 'D4', 'B5', 1.2, 54)
    gliss(harp, 14.5, 'F#3', 'F#5', 1.4, 52)

    # ---------- 鼓 ----------
    for bar in range(4, 24):
        b0 = bar * 4
        if bar < 12:
            if bar % 2 == 0: taiko.note(b0, 2, N('C2'), 64)
        elif bar < 20:
            taiko.note(b0, 2, N('C2'), 80); taiko.note(b0 + 2.5, 1, N('E2'), 58); taiko.note(b0 + 3, 1, N('C2'), 66)
        elif bar < 22:
            taiko.note(b0, 2, N('C2'), 62)
    # 定音鼓滚奏推进 B 段和尾声；B 段开头一记大锣
    for b0, b1, v0, v1, tn in ((44, 48, 40, 92, 'B2'), (76, 80, 46, 96, 'D3')):
        n = int((b1 - b0) * 8)
        for k in range(n): timp.note(b0 + k / 8, 0.2, N(tn), int(v0 + (v1 - v0) * k / n))
    timp.note(48, 2, N('E2'), 100); timp.note(80, 2, N('G2'), 90)
    kit.note(47, 1, 59, 40); kit.note(48, 3, 57, 82); kit.note(80, 3, 59, 70)   # 吊镲
    s.hit(mx.gong(98, 7, 0.5), 48, gain=-6, send=0.3)
    s.hit(mx.gong(87, 7, 0.4), 0, gain=-10, send=0.3)
    s.hit(mx.reverse_swell(1.66, 0.3), 46, gain=-10, send=0.2)
    # ---------- 合成层 ----------
    s.layer(lambda sec: mx.wind(sec, 0.10, 21), gain=-6, eq=[('hp', 200), ('lp', 5000)])
    s.layer(lambda sec: mx.drone([N('B1') and 61.74, 92.5], sec, 0.10, 700), gain=-8, rev='hall', send=0.2)
    return s

# 整首的音色：低频垫厚一点，高频加一点空气感
TONE = [('ls', 150, 2.5), ('hs', 7000, 4.0)]

if __name__ == '__main__':
    import sys
    s = build(); print(s.render(sys.argv[1] if len(sys.argv) > 1 else 'out/menu.mp3', target=-17.5, keep=True, post_eq=TONE))

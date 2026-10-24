"""选人、木人桩、武库三首循环曲，和胜利、失败、开出传说三段短曲"""
import numpy as np
import mixlib as mx
from song import Song, N, chord, line, arp, block, swell


def gliss(p, beat, lo, hi, dur, vel=64, notes='D E F# A B', down=False):
    pcs = [N(x + '0') % 12 for x in notes.split()]
    seq = [n for n in range(N(lo), N(hi) + 1) if n % 12 in pcs]
    if down: seq = seq[::-1]
    for i, n in enumerate(seq): p.note(beat + dur * i / len(seq), 1.2, n, vel + i // 3)


# ======================= 选人：点将台 —— 100 拍，D 羽调（D F G A C），16 小节 =======================
def build_select():
    s = Song('select', 100, 16, seed=31)
    hum = lambda b: s.hum(b, 0.005)
    rng = np.random.default_rng(8)
    celF = s.part('celF', 48, bank=40, gain=0, pan=0.3, eq=[('hp', 50)], rev='hall', send=0.16)
    basF = s.part('basF', 48, bank=50, gain=-5, eq=[('hp', 30), ('lp', 2500)], rev='hall', send=0.1)
    vlaF = s.part('vlaF', 48, bank=30, gain=4, pan=0.15, eq=[('hp', 120)], rev='hall', send=0.2)
    pizz = s.part('pizz', 45, bank=20, gain=6, pan=-0.3, eq=[('hp', 150)], rev='room', send=0.22)
    trem = s.part('trem', 44, bank=21, expr=70, gain=-4, pan=-0.25, eq=[('hp', 220)], rev='hall', send=0.3)
    horns = s.part('horns', 60, bank=17, expr=70, gain=-11, pan=-0.1, eq=[('hp', 120), ('peak', 450, -2, 1), ('lp', 6000)], rev='hall', send=0.32)
    shaku = s.part('shaku', 77, bank=17, expr=90, gain=1, pan=0.15, eq=[('hp', 300)], rev='hall', send=0.36)
    erhu = s.part('erhu', 40, bank=17, expr=90, gain=-4, pan=-0.1, eq=[('hp', 200), ('peak', 1500, 1.5, 0.9), ('peak', 380, -2.5, 1)], rev='hall', send=0.3)
    zheng = s.part('zheng', 107, gain=3, pan=0.4, eq=[('hp', 150), ('hs', 7000, 2)], rev='plate', send=0.25)
    choir = s.part('choir', 53, bank=17, expr=60, gain=-5, width=1.3, eq=[('hp', 200)], rev='hall', send=0.45)
    taiko = s.part('taiko', 116, gain=-5, eq=[('hp', 42), ('lp', 6000)], rev='hall', send=0.2, sat=1.15)
    toms = s.part('toms', 117, gain=-4, pan=-0.15, eq=[('hp', 60)], rev='hall', send=0.2)
    kit = s.part('kit', 0, drum=True, gain=-3, eq=[('hp', 200)], rev='room', send=0.2)
    okit = s.part('okit', 48, drum=True, gain=-2, rev='hall', send=0.3)
    prog = ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A'] * 2
    CH = {'Dm': ('D', 'D4 F4 A4'), 'Bb': ('Bb', 'D4 F4 Bb4'), 'C': ('C', 'E4 G4 C5'), 'Gm': ('G', 'D4 G4 Bb4'), 'A': ('A', 'C#4 E4 A4')}
    for bar, c in enumerate(prog):
        b0 = bar * 4; r = N(CH[c][0] + '2'); mid = chord(CH[c][1]); half = bar // 8
        # 大提琴、低音提琴：八分音符的固定音型（根音，反拍上五度）
        for k in range(8):
            n = r + (7 if k in (3, 7) else 12 if k == 5 else 0)
            celF.note(hum(b0 + k * 0.5), 0.32, n + 12, 80 + (12 if k in (0, 3, 6) else 0) + rng.integers(-4, 5))
        basF.note(b0, 1.4, r, 88); basF.note(b0 + 1.5, 0.4, r, 74); basF.note(b0 + 3, 0.9, r, 80)
        # 拨弦：切分的五声小动机
        motif = [0, None, 2, 1, None, 2, 0, None]
        arp(pizz, b0, [mid[0] + 12, mid[1] + 12, mid[2] + 12], motif, 0.5, dur=0.3, vel=72, hum=hum, rng=rng)
        if half == 1 or bar >= 4:
            for k in range(8): vlaF.note(hum(b0 + k * 0.5), 0.3, mid[1], 62 + (10 if k % 2 == 0 else 0))
        if bar >= 4: block(horns, b0, [m - 12 for m in mid], 3.9, 70)
        if half == 1: block(trem, b0, [m + 12 for m in mid[1:]], 3.9, 66); block(choir, b0, mid, 4.0, 60)
        # 太鼓：1、2.5、3（每四小节最后一拍加两记）
        taiko.note(b0, 1, N('C2'), 110); taiko.note(b0 + 1.5, 0.5, N('C2'), 86); taiko.note(b0 + 2, 1, N('C2'), 100)
        if bar % 4 == 3:
            for i, k in enumerate((3, 3.25, 3.5, 3.75)): toms.note(b0 + k, 0.3, N(['G3', 'E3', 'C3', 'A2'][i]), 84 + i * 6)
        if half == 1:
            for k in range(8): kit.note(hum(b0 + k * 0.5), 0.1, 70, 60 + (14 if k % 2 else 0))
        if bar % 8 == 0: okit.note(b0, 3, 57, 88)
    swell(horns, 16, 32, 60, 92); swell(horns, 32, 64, 80, 100)
    swell(trem, 32, 62, 60, 96); swell(choir, 32, 64, 50, 86)
    # 尺八的召唤（第 5–8 小节），二胡回应（第 9–16 小节）
    line(shaku, 16, '/D5:1.5 F5:0.5 G5:1 A5:1 ~≈C6:2 A5:1 G5:1 ~F5:1.5 G5:0.5 A5:1 D5:1 ~≈E5:4', vel=86, slide=0.2, vib=0.2, hum=hum)
    swell(shaku, 16, 18, 60, 96); swell(shaku, 28, 32, 96, 60)
    line(erhu, 32, '!D5:0.75 F5:0.25 G5:1 A5:1 C6:1 ~≈D6:2 C6:1 A5:1 G5:0.5 A5:0.5 F5:1 G5:1 D5:1 ~≈A5:4 '
                   '!D6:0.75 C6:0.25 A5:1 G5:1 F5:1 ~G5:2 A5:1 C6:1 ~≈D6:3 C6:0.5 A5:0.5 ~≈C#6:4', vel=90, slide=0.12, vib=0.28, hum=hum)
    swell(erhu, 32, 34, 70, 104); swell(erhu, 60, 64, 104, 80)
    gliss(zheng, 14.6, 'D4', 'D6', 1.3, 60, 'D F G A C'); gliss(zheng, 30.6, 'A3', 'A5', 1.3, 62, 'D F G A C'); gliss(zheng, 62.4, 'D4', 'F6', 1.5, 66, 'D F G A C')
    s.hit(mx.boom(2.5, 0.6), 0, gain=-7, send=0.1); s.hit(mx.boom(2.5, 0.6), 32, gain=-6, send=0.1)
    s.hit(mx.reverse_swell(1.4, 0.35), 64 - 1.4 * 100 / 60, gain=-8, send=0.2)
    s.layer(lambda sec: mx.drone([73.4, 110.0], sec, 0.1, 500), gain=-11)
    return s


# ======================= 木人桩：竹院晨练 —— 96 拍，G 宫五声（G A B D E），24 小节 =======================
def build_practice():
    s = Song('practice', 96, 24, seed=41)
    hum = lambda b: s.hum(b, 0.007)
    rng = np.random.default_rng(9)
    zheng = s.part('zheng', 107, gain=-3, pan=-0.3, eq=[('hp', 110), ('peak', 2600, 1.5, 1), ('hs', 8000, 1.5)], rev='plate', send=0.22)
    dizi = s.part('dizi', 73, bank=17, expr=96, gain=-8.5, pan=0.15, eq=[('hp', 300), ('peak', 3500, 1.5, 1)], rev='hall', send=0.28)
    pizzB = s.part('pizzB', 45, bank=50, gain=0, pan=0.05, eq=[('hp', 35), ('lp', 3000)], rev='room', send=0.15)
    pizzV = s.part('pizzV', 45, bank=20, gain=8, pan=-0.35, eq=[('hp', 200)], rev='room', send=0.22)
    strs = s.part('strs', 49, bank=21, expr=66, gain=-2.5, pan=0.3, eq=[('hp', 200)], rev='hall', send=0.35)
    marimba = s.part('marimba', 12, gain=8, pan=0.4, eq=[('hp', 200)], rev='room', send=0.25)
    blocks = s.part('blocks', 115, bank=1, gain=1.5, pan=0.25, eq=[('hp', 300)], rev='room', send=0.2)
    kit = s.part('kit', 0, drum=True, gain=3, eq=[('hp', 150)], rev='room', send=0.18)
    frame = s.part('frame', 116, gain=-2, eq=[('hp', 50), ('lp', 5000)], rev='room', send=0.2)
    prog = ['G', 'Em', 'C', 'D'] * 2 + ['Am', 'D', 'Bm', 'Em', 'C', 'D', 'G', 'G'] + ['G', 'Em', 'C', 'D', 'Am', 'D', 'G', 'G']
    CH = {'G': ('G', 'B3 D4 G4'), 'Em': ('E', 'B3 E4 G4'), 'C': ('C', 'C4 E4 G4'), 'D': ('D', 'D4 F#4 A4'), 'Am': ('A', 'C4 E4 A4'), 'Bm': ('B', 'B3 D4 F#4')}
    for bar, c in enumerate(prog):
        b0 = bar * 4; r = N(CH[c][0] + '2'); mid = chord(CH[c][1]); sec = 'AABC'[min(3, bar // 8 + (1 if bar >= 16 else 0))] if False else ('A' if bar < 8 else 'B' if bar < 16 else 'C')
        # 低音拨弦：根音、五度、八度的走动
        for k, (o, v) in enumerate(((0, 92), (7, 70), (12, 80), (7, 70))):
            pizzB.note(hum(b0 + k), 0.5, r + o, v + rng.integers(-4, 5))
        if bar % 2 == 1: pizzB.note(hum(b0 + 3.5), 0.3, r + 10 if c in ('Em', 'Am', 'Bm') else r + 9, 64)
        # 古筝：十六分切分音型（五声音阶里走）
        pool = [n for n in range(N('G3'), N('G5') + 1) if n % 12 in (7, 9, 11, 2, 4)]
        base = pool.index(min(pool, key=lambda n: abs(n - mid[0])))
        pat = [0, None, 2, 4, None, 3, 2, None, 1, 2, None, 4, 5, None, 4, 2]
        if sec != 'B' or bar % 2 == 0:
            for k, d in enumerate(pat):
                if d is None: continue
                zheng.note(hum(b0 + k * 0.25), 0.45, pool[min(len(pool) - 1, base + d)], 70 + (12 if k % 4 == 0 else 0) + rng.integers(-5, 6))
        else:
            gliss(zheng, b0 + 2, 'G4', 'E6', 1.0, 60, 'G A B D E')
        # 弦乐：反拍短和弦（B 段换成长音）
        if sec == 'B': block(strs, b0, mid, 3.9, 62)
        else:
            for k in (0.5, 1.5, 2.5, 3.5): block(pizzV, b0 + k, [m + 12 for m in mid[1:]], 0.25, 64)
        # 打击乐：木鱼、沙锤、手鼓
        for k, n, v in ((0, 'Bb3', 90), (0.75, 'D#4', 64), (1.5, 'C#4', 76), (2, 'Bb3', 84), (2.75, 'D#4', 64), (3.5, 'C#4', 72)):   # 寺庙木鱼只有 58–63 这几个键有声音
            blocks.note(hum(b0 + k), 0.2, N(n), v)
        for k in range(8): kit.note(hum(b0 + k * 0.5), 0.1, 70, 50 + (16 if k % 2 else 0))
        frame.note(b0, 0.5, N('E2'), 84); frame.note(b0 + 2, 0.5, N('E2'), 74); frame.note(b0 + 2.75, 0.3, N('G2'), 60)
        if sec == 'C' and bar % 2 == 0: marimba.note(b0 + 3, 0.5, mid[2] + 12, 66); marimba.note(b0 + 3.5, 0.5, mid[1] + 12, 60)
    swell(strs, 32, 64, 50, 80)
    # 笛子：A 段、C 段主旋律（俏皮，倚音多），B 段休息让古筝和弦乐唱
    A = '^G5:0.5 E5:0.5 D5:0.5 E5:0.5 G5:1 A5:1 ^B5:1.5 A5:0.5 G5:1 E5:1 G5:0.5 A5:0.5 B5:0.5 D6:0.5 ~E6:2 D6:1 B5:0.5 A5:0.5 ~B5:2 ' \
        '^G5:0.5 E5:0.5 D5:0.5 E5:0.5 G5:1 B5:1 ^D6:1.5 B5:0.5 A5:1 G5:1 E5:0.5 G5:0.5 A5:0.5 B5:0.5 ~A5:2 G5:0.5 E5:0.5 D5:1 ~G5:2'
    line(dizi, 0, A, vel=84, vib=0.14, hum=hum)
    line(dizi, 64, A, vel=88, vib=0.14, hum=hum)
    line(dizi, 40, 'r:2 B5:0.5 D6:0.5 ~E6:5 D6:0.5 B5:0.5 ~A5:4', vel=70, hum=hum)
    line(dizi, 56, 'r:2 D6:0.5 E6:0.5 ~G6:3 E6:0.5 D6:0.5 ~E6:1', vel=72, hum=hum)
    swell(dizi, 0, 2, 70, 96); swell(dizi, 30, 32, 96, 80); swell(dizi, 40, 44, 60, 82); swell(dizi, 64, 66, 76, 100)
    s.layer(lambda sec: mx.wind(sec, 0.06, 7), gain=-12, eq=[('hp', 400)])
    return s


# ======================= 武库：藏锋阁 —— 80 拍，B 羽调（B D E F# A），16 小节 =======================
def build_gacha():
    s = Song('gacha', 80, 16, seed=51)
    hum = lambda b: s.hum(b, 0.006)
    rng = np.random.default_rng(10)
    mbox = s.part('mbox', 10, gain=4, pan=0.35, eq=[('hp', 400)], rev='hall', send=0.45)
    celesta = s.part('celesta', 8, gain=0, pan=-0.3, eq=[('hp', 300)], rev='hall', send=0.45)
    harp = s.part('harp', 46, gain=0, pan=0.3, eq=[('hp', 100)], rev='hall', send=0.4)
    zheng = s.part('zheng', 107, bank=8, gain=6, pan=-0.35, eq=[('hp', 150), ('hs', 7000, 2)], rev='hall', send=0.4)
    pad = s.part('pad', 94, bank=17, expr=70, gain=-15, width=1.4, eq=[('hp', 120), ('lp', 7000)], rev='hall', send=0.4)
    glass = s.part('glass', 92, bank=17, expr=60, gain=-2, width=1.4, eq=[('hp', 300)], rev='hall', send=0.5)
    cello = s.part('cello', 49, bank=41, expr=70, gain=-10, pan=0.25, eq=[('hp', 45)], rev='hall', send=0.3)
    choir = s.part('choir', 53, bank=17, expr=56, gain=-10, width=1.3, eq=[('hp', 200)], rev='hall', send=0.5)
    shaku = s.part('shaku', 77, bank=17, expr=80, gain=-7, pan=0.1, eq=[('hp', 300)], rev='hall', send=0.45)
    bells = s.part('bells', 14, gain=2, pan=0.15, eq=[('hp', 250)], rev='hall', send=0.5)
    taiko = s.part('taiko', 116, gain=-8, eq=[('hp', 35), ('lp', 3000)], rev='hall', send=0.25)
    prog = ['Bm', 'G', 'D', 'A', 'Bm', 'Em', 'G', 'F#sus', 'Bm', 'G', 'D', 'A', 'G', 'Em', 'F#sus', 'F#m']
    CH = {'Bm': ('B', 'B3 D4 F#4'), 'G': ('G', 'B3 D4 G4'), 'D': ('D', 'A3 D4 F#4'), 'A': ('A', 'A3 C#4 E4'), 'Em': ('E', 'B3 E4 G4'),
          'F#sus': ('F#', 'B3 C#4 F#4'), 'F#m': ('F#', 'A3 C#4 F#4')}
    for bar, c in enumerate(prog):
        b0 = bar * 4; r = N(CH[c][0] + '2'); mid = chord(CH[c][1]); half = bar // 8
        block(pad, b0, mid, 4.0, 60)
        cello.note(b0, 3.9, r, 70)
        # 八音盒和钢片琴：错开的分解（有点像机关在转）
        ar = [mid[0] + 12, mid[1] + 12, mid[2] + 12, mid[1] + 24, mid[2] + 24]
        arp(mbox, b0, ar, [0, 2, 1, 3, 2, 4, 3, 1], 0.5, dur=1.0, vel=64, hum=hum, rng=rng)
        if half == 1: arp(celesta, b0 + 0.25, ar, [4, 2, 3, 1, 2, 0, 1, 3], 0.5, dur=0.8, vel=56, hum=hum, rng=rng)
        if bar % 2 == 0: harp.note(b0, 3, r + 12, 70); harp.note(b0 + 0.33, 2.6, r + 19, 62); harp.note(b0 + 0.66, 2.3, r + 24, 58)
        if half == 1: block(choir, b0, mid, 4.0, 56)
        taiko.note(b0, 1, N('C2'), 70); taiko.note(b0 + 0.75, 0.5, N('C2'), 52)   # 心跳
    swell(pad, 0, 8, 50, 80); swell(pad, 56, 64, 90, 66); swell(choir, 32, 40, 30, 70); swell(choir, 56, 64, 72, 40)
    swell(cello, 0, 32, 60, 80); swell(cello, 32, 56, 80, 92); swell(cello, 56, 64, 92, 64)
    # 古筝泛音感的高音句子 + 尺八长音
    line(zheng, 8, 'F#5:1 E5:0.5 D5:0.5 B4:2 r:4 A5:1 F#5:0.5 E5:0.5 D5:2', vel=70, vib=0)
    line(shaku, 32, '/B4:2 D5:1 E5:1 ~F#5:4 A5:1 F#5:0.5 E5:0.5 ~D5:2 E5:2 ~≈B4:4 r:4 '
                    'D5:1 E5:1 F#5:1 A5:1 ~B5:3 A5:1 ~≈F#5:4 ~E5:2 D5:2', vel=80, slide=0.22, vib=0.18, hum=hum)
    swell(shaku, 32, 34, 50, 90); swell(shaku, 58, 64, 90, 56)
    for b in (0, 32): bells.note(b, 4, N('B5'), 70); bells.note(b + 0.03, 4, N('F#6'), 52)
    for b in (16, 48): glass.note(b, 15.5, N('F#5'), 64); glass.note(b, 15.5, N('B5'), 54)
    gliss(harp, 30.5, 'B3', 'B5', 1.4, 56, 'B D E F# A'); gliss(harp, 62.4, 'D4', 'D6', 1.5, 56, 'B D E F# A')
    s.hit(mx.gong(80, 7, 0.35), 0, gain=-12, send=0.4)
    s.hit(mx.reverse_swell(2.0, 0.3), 32 - 2.0 * 80 / 60, gain=-12, send=0.3)
    s.layer(lambda sec: mx.drone([61.74, 92.5, 123.5], sec, 0.1, 600), gain=-10, rev='hall', send=0.2)
    return s


# ======================= 短曲 =======================
def build_victory():
    s = Song('victory', 100, 2, loop=False, tail=3.5, seed=61)
    horns = s.part('horns', 60, bank=17, expr=100, gain=0, pan=-0.15, eq=[('hp', 80)], rev='hall', send=0.3)
    tpt = s.part('tpt', 56, bank=17, expr=100, gain=-3, pan=0.15, eq=[('hp', 200)], rev='hall', send=0.3)
    bones = s.part('bones', 57, bank=17, expr=100, gain=-6.5, pan=0.25, eq=[('hp', 50)], rev='hall', send=0.25)
    strs = s.part('strs', 44, bank=21, expr=100, gain=-5, pan=-0.25, eq=[('hp', 150)], rev='hall', send=0.3)
    cel = s.part('cel', 49, bank=41, expr=100, gain=-2, pan=0.3, eq=[('hp', 40)], rev='hall', send=0.25)
    choir = s.part('choir', 52, bank=17, expr=96, gain=-6, width=1.3, rev='hall', send=0.45)
    zheng = s.part('zheng', 107, gain=4, pan=-0.35, rev='plate', send=0.3)
    taiko = s.part('taiko', 116, gain=-2, eq=[('hp', 30)], rev='hall', send=0.2, sat=1.2)
    timp = s.part('timp', 47, gain=-4, rev='hall', send=0.25)
    okit = s.part('okit', 48, drum=True, gain=-6, rev='hall', send=0.3)
    # 号角：A4 D5 F#5 | A5——（D 大调，主音上结束）
    line(horns, 0, '!A4:0.5 D5:0.5 F#5:0.5 A5:0.5 ~D6:5', vel=100, vib=0.1)
    line(tpt, 2, '~F#5:2 ~A5:3', vel=96, vib=0.08)
    block(bones, 2, [N('D3'), N('A3')], 5, 100); block(cel, 2, [N('D2'), N('D3')], 5.5, 104)
    block(strs, 2, chord('D5 F#5 A5 D6'), 5.5, 100); block(choir, 2, chord('D4 F#4 A4 D5'), 6, 96)
    swell(choir, 2, 3, 70, 110); swell(strs, 2, 8, 110, 90)
    gliss(zheng, 1.2, 'D4', 'D6', 0.8, 70)
    for k in range(16): taiko.note(k / 8, 0.2, N('C2'), 60 + k * 3)
    taiko.note(2, 2, N('C2'), 127); taiko.note(3, 1, N('C2'), 100); taiko.note(3.5, 1, N('C2'), 110); taiko.note(4, 2, N('C2'), 120)
    timp.note(2, 3, N('D2'), 110); timp.note(4, 3, N('A2'), 100)
    okit.note(2, 4, 57, 110); okit.note(2, 4, 59, 90)
    s.hit(mx.boom(3, 0.9), 2, gain=-8, send=0.1); s.hit(mx.gong(73, 6, 0.6), 2, gain=-8, send=0.3)
    return s


def build_defeat():
    s = Song('defeat', 60, 2, loop=False, tail=3.0, seed=62)
    erhu = s.part('erhu', 40, bank=17, expr=80, gain=-1, eq=[('hp', 200), ('peak', 1400, 3, 0.9), ('peak', 380, -2, 1)], rev='hall', send=0.4)
    cel = s.part('cel', 49, bank=41, expr=80, gain=-4, pan=0.3, eq=[('hp', 40)], rev='hall', send=0.35)
    vla = s.part('vla', 49, bank=31, expr=70, gain=-2, pan=-0.2, rev='hall', send=0.4)
    bass = s.part('bass', 49, bank=51, expr=70, gain=-1, eq=[('lp', 2000)], rev='hall', send=0.25)
    # 二胡：A4 滑到 G4、F4、E4，最后长长地落在 D4
    line(erhu, 0, '~A4:1 ≈G4:0.5 F4:0.5 ~≈E4:1 C4:0.5 ≈D4:0.5 ~D4:4', vel=84, slide=0.25, vib=0.32, vib_hz=5.2)
    swell(erhu, 0, 1, 70, 100); swell(erhu, 3, 8, 96, 30)
    block(cel, 0, [N('D3'), N('A3')], 7.5, 80); block(bass, 0, [N('D2')], 7.5, 78); block(vla, 1, chord('F4 A4'), 6.5, 64)
    swell(cel, 0, 8, 90, 30); swell(vla, 1, 8, 60, 20); swell(bass, 0, 8, 80, 20)
    s.hit(mx.gong(65, 7, 0.4), 0, gain=-10, send=0.4)
    s.layer(lambda sec: mx.wind(sec, 0.08, 9), gain=-10, eq=[('hp', 200)])
    return s


def build_legendary():
    s = Song('legendary', 90, 2, loop=False, tail=2.5, seed=63)
    harp = s.part('harp', 46, gain=4, pan=0.3, rev='hall', send=0.45)
    celesta = s.part('celesta', 8, gain=5, pan=-0.3, rev='hall', send=0.5)
    choir = s.part('choir', 52, bank=17, expr=100, gain=-4, width=1.4, rev='hall', send=0.5)
    strs = s.part('strs', 49, bank=21, expr=100, gain=-6, pan=-0.2, rev='hall', send=0.4)
    horns = s.part('horns', 60, bank=17, expr=96, gain=-5, rev='hall', send=0.35)
    bells = s.part('bells', 14, gain=-1, pan=0.15, rev='hall', send=0.5)
    okit = s.part('okit', 48, drum=True, gain=-12, rev='hall', send=0.4)
    taiko = s.part('taiko', 116, gain=1, rev='hall', send=0.25)
    gliss(harp, 0, 'A3', 'A6', 1.9, 64, 'A B C# E F#'); gliss(celesta, 0.3, 'A4', 'E7', 1.6, 56, 'A B C# E F#')
    block(choir, 2, chord('A3 E4 A4 C#5 E5'), 5.5, 104); block(strs, 2, chord('E5 A5 C#6'), 5.5, 100)
    block(horns, 2, chord('A2 E3 A3 C#4'), 5, 100)
    bells.note(2, 4, N('A5'), 96); bells.note(2.02, 4, N('E6'), 80)
    swell(choir, 2, 2.6, 60, 116); swell(choir, 4, 7.5, 116, 70)
    okit.note(2, 4, 57, 112); okit.note(2, 4, 59, 96)
    taiko.note(2, 2, N('C2'), 120)
    s.hit(mx.reverse_swell(1.3, 0.45), 2 - 1.3 * 90 / 60, gain=-9, send=0.3)
    s.hit(mx.boom(3, 0.9), 2, gain=-12, send=0.1)
    return s


# 整首的音色微调（在总线压缩、限幅之前）：这几首的高频偏暗，补一点亮度；武库要亮一些
TONE = dict(select=[('hs', 7000, 2.5)], practice=[('ls', 120, 1.5), ('peak', 260, 3.0, 1.0), ('hs', 7000, 2.0)], gacha=[('hs', 6000, 4.0)],
            victory=[('ls', 60, -2.0), ('peak', 240, 2.0, 1.0), ('hs', 7000, 2.0)], defeat=[('hs', 7000, 1.5)],
            legendary=[('ls', 70, -3.0), ('peak', 150, 2.0, 1.0), ('hs', 6000, 1.0)])

if __name__ == '__main__':
    import sys
    which = sys.argv[1:] or ['select', 'practice', 'gacha', 'victory', 'defeat', 'legendary']
    tgt = dict(select=-17.5, practice=-17.5, gacha=-18.0, victory=-15.0, defeat=-16.0, legendary=-15.0)
    for w in which:
        s = globals()['build_' + w]()
        print(s.render(f'out/{w}.mp3', target=tgt[w], keep=True, post_eq=TONE.get(w)), flush=True)

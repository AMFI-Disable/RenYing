"""对战：刃影交锋 —— 140 拍，E 羽调（E G A B D），32 小节一循环
   A 段：太鼓律动 + 弦乐十六分音符顿弓 + 二胡主题；B 段：加铜管短促和弦、笛子对位；
   C 段：鼓点减半、合唱和古筝刮奏的喘息段；D 段：全体高潮，最后一小节鼓的过门接回开头。"""
import re
import numpy as np
import mixlib as mx
from song import Song, N, chord, line, arp, block, swell

up8 = lambda t: re.sub(r'([A-G][#b]?)(\d):', lambda m: m.group(1) + str(int(m.group(2)) + 1) + ':', t)

def build(name='battle', bpm=140, shift=0, overtime=False):
    s = Song(name, bpm, 32 if not overtime else 16, seed=21 + shift)
    hum = lambda b: s.hum(b, 0.004)
    T = lambda n: N(n) + shift
    # ---------- 声部 ----------
    vlnF = s.part('vlnF', 48, bank=20, gain=7, pan=-0.35, eq=[('hp', 160), ('peak', 3000, 1.5, 1)], rev='hall', send=0.18)
    vlaF = s.part('vlaF', 48, bank=30, gain=4, pan=0.2, eq=[('hp', 120)], rev='hall', send=0.18)
    celF = s.part('celF', 48, bank=40, gain=3, pan=0.35, eq=[('hp', 50)], rev='hall', send=0.14)
    basF = s.part('basF', 48, bank=50, gain=2, pan=0.1, eq=[('hp', 30), ('lp', 3000)], rev='hall', send=0.1)
    pizz = s.part('pizz', 45, gain=1, pan=-0.2, eq=[('hp', 120)], rev='room', send=0.2)
    trem = s.part('trem', 44, bank=21, expr=80, gain=-3, pan=-0.25, eq=[('hp', 200)], rev='hall', send=0.3)
    horns = s.part('horns', 60, bank=17, expr=96, gain=-3.5, pan=-0.15, eq=[('hp', 90), ('lp', 7000)], rev='hall', send=0.3)
    bones = s.part('bones', 57, bank=17, expr=96, gain=-5.5, pan=0.25, eq=[('hp', 60), ('lp', 6000)], rev='hall', send=0.25)
    erhu = s.part('erhu', 40, bank=17, expr=100, gain=-1, pan=-0.05, eq=[('hp', 200), ('peak', 1500, 2, 0.9), ('peak', 380, -2.5, 1), ('lp', 10000)], rev='hall', send=0.24)
    dizi = s.part('dizi', 72, bank=17, expr=96, gain=-3, pan=0.2, eq=[('hp', 400), ('peak', 4000, 1, 1)], rev='hall', send=0.28)
    suona = s.part('suona', 111, bank=17, expr=100, gain=-6, pan=0.05, eq=[('hp', 300), ('lp', 7000), ('peak', 2200, 1, 1)], rev='hall', send=0.26)
    zheng = s.part('zheng', 107, gain=-3, pan=0.4, eq=[('hp', 150), ('hs', 7000, 2)], rev='plate', send=0.22)
    choir = s.part('choir', 52, bank=17, expr=90, gain=-3, width=1.3, eq=[('hp', 180), ('lp', 9000)], rev='hall', send=0.4)
    taiko = s.part('taiko', 116, gain=-3, eq=[('hp', 42), ('peak', 80, 2, 1), ('lp', 6000)], rev='hall', send=0.16, comp=(-20, 3, 0.003, 0.12), sat=1.2)
    bdrum = s.part('bdrum', 116, bank=8, gain=-3, eq=[('hp', 28), ('lp', 3000)], rev='hall', send=0.14)
    toms = s.part('toms', 117, gain=-3, pan=0.15, eq=[('hp', 60)], rev='hall', send=0.16)
    kit = s.part('kit', 0, drum=True, gain=-4, eq=[('hp', 180)], rev='room', send=0.18)
    okit = s.part('okit', 48, drum=True, gain=-4, eq=[('hp', 120)], rev='hall', send=0.25)
    timp = s.part('timp', 47, gain=-2, eq=[('hp', 40)], rev='hall', send=0.2)

    # ---------- 和声（E 小调色彩，B 段落在 B 大三和弦上制造回到 Em 的推力） ----------
    if not overtime:
        prog = ['Em', 'Em', 'C', 'D', 'Em', 'Em', 'C', 'B',
                'Am', 'Em', 'C', 'D', 'Am', 'Em', 'C', 'B',
                'C', 'D', 'Bm', 'Em', 'C', 'D', 'B', 'B',
                'Em', 'C', 'D', 'Bm', 'Em', 'C', 'D', 'B']
    else:
        prog = ['Em', 'C', 'D', 'B', 'Em', 'C', 'Am', 'B'] * 2
    R = {'Em': 'E', 'C': 'C', 'D': 'D', 'B': 'B', 'Am': 'A', 'Bm': 'B'}
    CH = {'Em': 'E4 G4 B4', 'C': 'E4 G4 C5', 'D': 'F#4 A4 D5', 'B': 'F#4 B4 D#5', 'Am': 'E4 A4 C5', 'Bm': 'F#4 B4 D5'}
    rng = np.random.default_rng(5)
    nb = len(prog)
    def sec_of(bar):
        if overtime: return 'D'
        return 'ABCD'[bar // 8]
    # 弦乐顿弓：十六分音符，按小节的根音和五度来回（重音在 1、2.5、3、4.5）
    acc = [16, 0, 6, 0, 4, 0, 14, 0, 12, 0, 4, 0, 8, 0, 10, 2]
    for bar, c in enumerate(prog):
        b0 = bar * 4; sec = sec_of(bar)
        r = T(R[c] + '3'); fifth = r + 7; third = r + (4 if c in ('C', 'D', 'B') else 3)
        if sec != 'C':
            pat = [r, r, fifth, r, r + 12, r, fifth, r, r, r, fifth, third + 12, r + 12, fifth, r, fifth]
            for k, n in enumerate(pat):
                t = b0 + k * 0.25
                vlaF.note(hum(t), 0.16, n, 74 + acc[k] + rng.integers(-4, 5))
                celF.note(hum(t), 0.16, n - 12, 76 + acc[k] + rng.integers(-4, 5))
            for k in (0, 1.5, 2, 3.5):
                basF.note(b0 + k, 0.4, r - 12, 92 if k == 0 else 80)
        else:   # C 段：长音
            celF.note(b0, 3.8, r - 12, 70); basF.note(b0, 3.8, r - 12, 66); vlaF.note(b0, 3.8, r, 58)
        # 小提琴：A 段八分音符高音持续，B/D 段十六分音符和弦分解
        mid = [T(x) for x in CH[c].split()]
        if sec == 'A':
            for k in range(8): vlnF.note(hum(b0 + k * 0.5), 0.3, mid[2] + 12 if k % 2 else mid[1] + 12, 66 + (10 if k in (0, 3, 6) else 0))
        elif sec in ('B', 'D'):
            for k in range(16): vlnF.note(hum(b0 + k * 0.25), 0.16, [mid[0], mid[1], mid[2], mid[1]][k % 4] + 12, 70 + acc[k] // 2)
        else:
            trem.note(b0, 3.9, mid[1] + 12, 70); trem.note(b0, 3.9, mid[2] + 12, 66)
        # 拨弦：反拍
        if sec in ('A', 'B'):
            for k in (0.5, 1.5, 2.5, 3.5): pizz.note(b0 + k, 0.3, mid[0] if k < 2 else mid[1], 70)
        # 铜管：B、D 段的短促和弦（1、2.5 拍），D 段第 4 小节一组长音
        if sec in ('B', 'D'):
            for k, d in ((0, 0.6), (1.5, 0.45), (3.5, 0.4)):
                if k == 3.5 and bar % 2 == 0: continue
                block(horns, b0 + k, [m - 12 for m in mid], d, 96 if k == 0 else 84)
                block(bones, b0 + k, [r - 12, r - 5], d, 92 if k == 0 else 80)
        if sec == 'C':
            block(horns, b0, [m - 12 for m in mid], 3.9, 70); block(choir, b0, mid, 4.0, 72)
            if bar >= 20: block(bones, b0, [r - 12, r - 5], 3.9, 74)
        if sec == 'D':
            block(choir, b0, mid, 4.0, 82)
        # 古筝：每两小节一串快速上行
        if bar % 2 == 1 and sec != 'C':
            pcs = [4, 7, 9, 11, 2]
            seq = [n for n in range(T('E4'), T('E6') + 1) if (n - shift) % 12 in pcs]
            for i, n in enumerate(seq[:10]): zheng.note(b0 + 3 + i * 0.1, 0.6, n, 64 + i * 2)
        if sec == 'C':
            arp(zheng, b0, [T(x) for x in 'E4 G4 A4 B4 D5 E5'.split()], [0, 2, 4, 5, 4, 2, 3, 1], 0.5, dur=1.2, vel=66, hum=hum, rng=rng)
    swell(trem, 64, 96, 60, 100); swell(choir, 64, 96, 62, 96); swell(choir, 96, 128, 90, 104)
    swell(horns, 64, 92, 60, 96); swell(horns, 92, 96, 96, 110)

    # ---------- 旋律 ----------
    if not overtime:
        # A 段：二胡主题（两个四小节乐句），带滑音和倚音
        A = '!E5:0.75 G5:0.25 A5:0.5 B5:1 A5:0.5 ≈G5:0.5 E5:0.5 ' \
            'D5:0.5 E5:0.5 G5:0.5 A5:0.5 ~B5:2 ' \
            '!C6:0.75 B5:0.25 A5:0.5 G5:0.5 A5:1 E5:1 ' \
            'D5:0.5 E5:0.5 F#5:0.5 G5:0.5 ~≈A5:2 ' \
            '!E5:0.75 G5:0.25 A5:0.5 B5:1 D6:0.5 ≈E6:0.5 D6:0.5 ' \
            'B5:0.5 A5:0.5 B5:0.5 D6:0.5 ~E6:2 ' \
            '!C6:0.5 B5:0.5 A5:0.5 G5:0.5 E5:0.5 G5:0.5 A5:1 ' \
            '~≈B5:3 A5:0.5 F#5:0.5'
        line(erhu, 0, A, vel=94, slide=0.1, vib=0.28, vib_hz=6.2, hum=hum)
        # B 段：笛子在高处对位，二胡唱低一点的副旋律
        Bd = 'E6:0.5 r:0.5 E6:0.25 G6:0.25 A6:0.5 B6:1 A6:1 ' \
             'G6:0.5 E6:0.5 D6:0.5 E6:0.5 ~G6:2 ' \
             'E6:0.5 r:0.5 E6:0.25 G6:0.25 A6:0.5 B6:0.5 D7:0.5 B6:1 ' \
             'A6:0.5 G6:0.5 F#6:0.5 A6:0.5 ~B6:2 ' \
             'C7:0.5 B6:0.5 A6:0.5 G6:0.5 A6:1 E6:1 ' \
             'G6:0.5 A6:0.5 B6:1 ~E6:2 ' \
             'C7:0.5 B6:0.5 A6:0.5 B6:0.5 G6:0.5 A6:0.5 E6:0.5 G6:0.5 ' \
             '~F#6:2 D#6:1 F#6:1'
        line(dizi, 32, Bd, vel=88, vib=0.15, hum=hum)
        Be = 'A4:2 C5:1 B4:1 ≈G4:2 E4:2 C5:2 B4:1 A4:1 ≈A4:4 ' \
             'A4:2 C5:1 E5:1 ≈D5:2 B4:2 C5:1 D5:1 E5:1 G5:1 ~≈F#5:4'
        line(erhu, 32, Be, vel=80, slide=0.16, vib=0.3, hum=hum)
        # C 段：唢呐（双簧，用 Shenai 音色）吹一句悠长的
        Cs = '~E5:2 G5:1 A5:1 ~A5:3 B5:0.5 A5:0.5 ~≈D5:4 D5:2 E5:2 ' \
             '~G5:2 A5:1 B5:1 ~D6:3 B5:1 ~≈A5:2 F#5:2 ~≈B5:4'
        line(suona, 64, Cs, vel=88, slide=0.12, vib=0.25, vib_hz=5.2, hum=hum)
        swell(suona, 64, 66, 70, 100); swell(suona, 90, 96, 100, 70)
        # D 段：二胡和笛子齐奏主题，高八度
        line(erhu, 96, A, vel=100, slide=0.1, vib=0.3, vib_hz=6.4, hum=hum)
        line(dizi, 96, up8(A), vel=80, vib=0.12, hum=hum)
    else:
        O = '!F#5:0.5 A5:0.5 B5:0.5 C#6:0.5 ~E6:1 C#6:0.5 B5:0.5 ' \
            'A5:0.5 B5:0.5 C#6:0.5 E6:0.5 ~F#6:2 ' \
            '!E6:0.5 C#6:0.5 B5:0.5 A5:0.5 F#5:1 A5:1 ' \
            'G#5:0.5 B5:0.5 C#6:0.5 E#6:0.5 ~≈C#6:2 ' \
            '!F#6:0.5 E6:0.5 C#6:0.5 B5:0.5 ~C#6:1 A5:1 ' \
            'B5:0.5 A5:0.5 F#5:0.5 A5:0.5 ~B5:2 ' \
            '!C#6:0.5 E6:0.5 F#6:0.5 A6:0.5 ~≈F#6:2 ' \
            '~E#6:3 r:1'
        line(erhu, 0, O, vel=96, slide=0.08, vib=0.3, vib_hz=6.6, hum=hum)
        line(erhu, 32, O, vel=104, slide=0.08, vib=0.3, vib_hz=6.6, hum=hum)
        line(suona, 32, O, vel=84, slide=0.08, vib=0.22, hum=hum)
        swell(suona, 32, 34, 70, 104)
    swell(erhu, 0, 1, 90, 110)

    # ---------- 鼓 ----------
    for bar in range(nb):
        b0 = bar * 4; sec = sec_of(bar)
        if sec == 'C':
            taiko.note(b0, 1, T('C2') - shift, 100); taiko.note(b0 + 2, 1, T('C2') - shift, 84)
            bdrum.note(b0, 2, N('C2'), 90)
            continue
        # 太鼓：1、2.5、3、4（重），另有小鼓填 16 分
        for k, v in ((0, 118), (1.5, 96), (2, 108), (3, 100), (3.5, 86)):
            taiko.note(hum(b0 + k), 0.8, N('C2'), v)
        for k in (0.75, 2.75):
            taiko.note(hum(b0 + k), 0.3, N('E2'), 72)
        bdrum.note(b0, 1.5, N('C2'), 100 if bar % 2 == 0 else 86)
        # 通通鼓：每四小节最后一拍半的过门
        if bar % 4 == 3:
            for i, (k, n) in enumerate(((2.5, 'G3'), (2.75, 'E3'), (3, 'C3'), (3.25, 'A2'), (3.5, 'F2'), (3.75, 'D2'))):
                toms.note(b0 + k, 0.3, N(n), 90 + i * 4)
        # 架子鼓：沙锤十六分、军鼓在 2、4（B/D 段）
        for k in range(16):
            kit.note(hum(b0 + k * 0.25), 0.1, 70, 56 + (18 if k % 4 == 2 else 0) + rng.integers(-6, 7))
        if sec in ('B', 'D'):
            okit.note(b0 + 1, 0.3, 38, 92); okit.note(b0 + 3, 0.3, 38, 96)
            if bar % 2 == 1: okit.note(b0 + 3.75, 0.2, 38, 70)
        if bar % 8 == 0:
            kit.note(b0, 2, 52, 100)   # 中国镲
            okit.note(b0, 3, 57, 96)
        if bar % 4 == 0 and bar % 8 != 0: kit.note(b0, 1.5, 55, 80)
    # 定音鼓：C 段尾的滚奏把 D 段推出来
    if not overtime:
        for k in range(32): timp.note(88 + k / 8, 0.2, N('B2'), 40 + k * 2)
        timp.note(96, 2, N('E2'), 110); timp.note(64, 2, N('C3'), 96)
        s.hit(mx.reverse_swell(1.7, 0.4), 96 - 1.7 * bpm / 60, gain=-6, send=0.2)
        s.hit(mx.boom(3.0, 0.8), 96, gain=-4, send=0.1); s.hit(mx.boom(3.0, 0.7), 0, gain=-6, send=0.1)
        s.hit(mx.boom(3.0, 0.6), 64, gain=-7, send=0.15)
        s.hit(mx.gong(90, 6, 0.5), 64, gain=-7, send=0.3)
        s.hit(mx.riser(3.4, 0.25), 128 - 3.4 * bpm / 60, gain=-10, send=0.15)
    else:
        for k in range(32): timp.note(56 + k / 8, 0.2, N('C#3'), 40 + k * 2)
        s.hit(mx.boom(3.0, 0.8), 0, gain=-4, send=0.1); s.hit(mx.boom(3.0, 0.8), 32, gain=-4, send=0.1)
        s.hit(mx.riser(3.4, 0.3), 64 - 3.4 * bpm / 60, gain=-8, send=0.15)
    s.layer(lambda sec: mx.drone([41.2 * 2 ** (shift / 12), 61.7 * 2 ** (shift / 12)], sec, 0.12, 400), gain=-10)
    return s

# 整首的音色：低中频补一点厚度，2k 附近收一点免得刺耳，高频提一点亮度
TONE = [('peak', 230, 1.5, 0.8), ('peak', 2100, -1.5, 1.0), ('hs', 7000, 2.5)]

if __name__ == '__main__':
    import sys
    which = sys.argv[1:] or ['battle', 'overtime']
    for w in which:
        s = build() if w == 'battle' else build('overtime', 156, 2, True)
        print(s.render(f'out/{w}.mp3', target=-16.0 if w == 'battle' else -15.5, keep=True, post_eq=TONE if w == 'battle' else TONE + [('ls', 60, -2.5)]), flush=True)

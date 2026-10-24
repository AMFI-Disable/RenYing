"""一首曲子：若干 MIDI 声部（各自的音色库、均衡、声像、混响量）+ 合成层；循环曲渲染三遍取中间一遍，首尾无缝"""
import os
import numpy as np
import midi, mixlib as mx
from mixlib import SR

GM = dict(piano=0, celesta=8, glock=9, musicbox=10, vibes=11, marimba=12, bells=14, dulcimer=15,
          nylon=24, violin=40, viola=41, cello=42, contrabass=43, tremolo=44, pizz=45, harp=46, timpani=47,
          strings=48, slowstr=49, synstr=50, choir=52, oohs=53, synvoice=54, orchhit=55,
          trumpet=56, trombone=57, tuba=58, horn=60, brass=61, sax=65, oboe=68, bassoon=70, clarinet=71,
          piccolo=72, flute=73, recorder=74, panflute=75, bottle=76, shakuhachi=77, whistle=78, ocarina=79,
          padwarm=89, padnew=88, padchoir=91, padhalo=94, padsweep=95, atmos=99, sitar=104, banjo=105,
          shamisen=106, koto=107, kalimba=108, fiddle=110, taiko=116, tom=117, syndrum=118, revcym=119)

# 五声音阶（以宫为 0）；羽调式 = 小调色彩，徵调式、商调式各有味道
PENTA = [0, 2, 4, 7, 9]


def scale_notes(root, mode=PENTA, lo=36, hi=96):
    out = []
    for o in range(-2, 10):
        for s in mode:
            n = root + 12 * o + s
            if lo <= n <= hi: out.append(n)
    return sorted(set(out))


def snap(n, notes):
    return min(notes, key=lambda x: (abs(x - n), x))


class Song:
    def __init__(self, name, bpm, bars, bpb=4, loop=True, tail=5.0, seed=1):
        self.name, self.bpm, self.bars, self.bpb, self.loop, self.tail = name, bpm, bars, bpb, loop, tail
        self.beats = bars * bpb
        self.parts = []      # (Part, opts)
        self.layers = []     # (fn(total_sec) -> 2×n, opts)
        self.hits = []       # (signal, beat, opts)
        self.rng = np.random.default_rng(seed)
        self.ch_free = [c for c in range(16) if c != 9]

    sec = lambda self, beat: beat * 60.0 / self.bpm

    def part(self, name, prog, sf=None, drum=False, gain=0.0, pan=0.0, width=1.0, eq=None, rev='hall', send=0.2, comp=None, sat=None, vol=100, fgain=0.6, duck=0.0, bank=0, expr=None):
        ch = 9 if drum else self.ch_free[len(self.parts) % 15]   # 每个声部单独渲染，通道可以重复
        p = midi.Part(name, GM.get(prog, prog) if isinstance(prog, str) else prog, ch, vol=vol, bank=bank)
        p.bpm = self.bpm
        if expr is not None: p.cc(0, 2, expr)   # 音色库里带 Expr. 的音色要靠 CC2 出声，也靠它做强弱
        self.parts.append((p, dict(sf=sf or mx.SF, gain=gain, pan=pan, width=width, eq=eq or [], rev=rev, send=send, comp=comp, sat=sat, fgain=fgain, duck=duck)))
        return p

    def layer(self, fn, gain=0.0, rev=None, send=0.0, eq=None, pan=0.0):
        """fn(秒数) → 2×n 的信号；循环曲只生成一遍，再首尾交叉淡化成可以无缝循环的一段"""
        self.layers.append((fn, dict(gain=gain, rev=rev, send=send, eq=eq or [], pan=pan)))

    def hit(self, sig, beat, gain=0.0, rev='hall', send=0.15, pan=0.0):
        self.hits.append((sig, beat, dict(gain=gain, rev=rev, send=send, pan=pan)))

    # 人性化：时值和力度的小抖动（同一首曲子每一遍完全一样，循环不会露馅）
    def hum(self, beat, amt=0.012):
        return beat + self.rng.normal(0, amt)

    def render(self, out_mp3, target=-17.0, kbps=144, ceil=-1.3, xfade=0.02, fade_out=None, keep=False, post_eq=None):
        reps = 3 if self.loop else 1
        Lb = self.beats; Ls = self.sec(Lb); n_loop = int(round(Ls * SR))
        total = Ls * reps + self.tail
        N = int(np.ceil(total * SR)) + SR
        dry = np.zeros((2, N)); sends = {}; duck_src = []
        work = os.path.join(mx.OUT, self.name); os.makedirs(work, exist_ok=True)
        for i, (p, o) in enumerate(self.parts):
            if self.loop:
                ev = list(p.ev); p.ev = [(b + k * Lb, od, d) for k in range(reps) for (b, od, d) in ev]
            mid = os.path.join(work, f'{i:02d}-{p.name}.mid'); wav = mid[:-4] + '.wav'
            midi.write(mid + '.new', [p], self.bpm)
            key = open(mid + '.new', 'rb').read() + f"|{o['sf']}|{o['fgain']}".encode()
            # 音符和音色库都没变、分轨还在（keep=True 留下的）就不用再跑一遍 fluidsynth，只重新混音
            same = os.path.exists(wav) and os.path.exists(mid + '.key') and open(mid + '.key', 'rb').read() == key
            os.replace(mid + '.new', mid)
            x = mx.fit(mx.load(wav) if same else mx.render(mid, wav, o['sf'], o['fgain']), N)
            open(mid + '.key', 'wb').write(key)
            if not keep: os.remove(wav)
            if o['eq']: x = mx.eq(x, o['eq'])
            if o['sat']: x = mx.sat(x, o['sat'])
            if o['comp']: x = mx.compress(x, *o['comp'])
            x = x * mx.db(o['gain'])
            if o['pan']: x = mx.pan(x, o['pan'])
            if o['width'] != 1.0: x = mx.width(x, o['width'])
            if o['duck']: duck_src.append((x, o['duck']))
            dry += x
            if o['rev'] and o['send'] > 0: sends[o['rev']] = sends.get(o['rev'], 0) + x * o['send']
        for fn, o in self.layers:
            if self.loop:
                k = int(SR * 1.0); one = mx.fit(fn(Ls + 1.0), n_loop + k)
                w = np.linspace(0, 1, k); seg = one[:, :n_loop].copy()
                seg[:, :k] = one[:, :k] * w + one[:, n_loop:n_loop + k] * (1 - w)
                x = mx.fit(np.tile(seg, (1, reps)), N)
            else:
                x = mx.fit(fn(total), N)
            if o['eq']: x = mx.eq(x, o['eq'])
            x = x * mx.db(o['gain'])
            if o['pan']: x = mx.pan(x, o['pan'])
            dry += x
            if o['rev'] and o['send'] > 0: sends[o['rev']] = sends.get(o['rev'], 0) + x * o['send']
        for sig, beat, o in self.hits:
            buf = np.zeros((2, N))
            for k in range(reps):
                at = self.sec(beat + k * Lb)
                s = sig if sig.ndim == 2 else np.stack([sig, sig])
                i0 = int(round(at * SR)); e = min(N, i0 + s.shape[1]); buf[:, i0:e] += s[:, :e - i0]
            buf *= mx.db(o['gain'])
            if o['pan']: buf = mx.pan(buf, o['pan'])
            dry += buf
            if o['rev'] and o['send'] > 0: sends[o['rev']] = sends.get(o['rev'], 0) + buf * o['send']
        wet = np.zeros((2, N))
        for kind, s in sends.items():
            r = mx.reverb(s, kind, 1.0); wet += r[:, :N]
        mixbus = dry + wet
        if self.loop:
            a, b = n_loop, 2 * n_loop; k = int(xfade * SR)
            y = mixbus[:, a:b].copy()
            w = np.linspace(0, 1, k) ** 0.5
            y[:, -k:] = mixbus[:, b - k:b] * (1 - w) + mixbus[:, a - k:a] * w
        else:
            end = int((Ls + self.tail) * SR); y = mixbus[:, :end]
            y = mx.fade(y, 0, fade_out if fade_out else min(1.5, self.tail * 0.6))
        if post_eq: y = mx.eq(y, post_eq)   # 整首的音色微调（在总线压缩、限幅之前）
        y = mx.master(y, target, ceil)
        mx.encode_mp3(y, out_mp3, kbps, loop=self.loop)
        i, pk = mx.lufs(y)
        return dict(name=self.name, sec=round(y.shape[1] / SR, 2), lufs=i, peak=pk)


# ---------------- 记谱 ----------------
NAMES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def N(s):
    """'F#5' → 78；'Bb3' → 58"""
    s = s.strip(); k = NAMES[s[0].upper()]; i = 1
    while i < len(s) and s[i] in '#b':
        k += 1 if s[i] == '#' else -1; i += 1
    return k + 12 * (int(s[i:]) + 1)


def chord(names): return [N(x) for x in names.split()]


def line(p, beat, text, vel=88, legato=0.97, slide=0.14, vib=0.22, vib_hz=5.6, vib_min=0.9, hum=None, swing=0.0, bend_rng=12):
    """一条旋律：'A5:1.5 /B5:0.5 ~D6:2 r:1 ≈E6:1 ^C6:0.5'
       / 从下面滑上来  ≈ 从上一个音滑过来（二胡那种）  ~ 长音揉弦  \\ 尾音下滑  ^X 前面加一个倚音（从上方）  !  重音"""
    b = beat; prev = None
    for tok in text.split():
        if ':' not in tok: continue
        name, d = tok.split(':'); d = float(d)
        if name in ('r', '-'):
            b += d; prev = None if name == 'r' else prev; continue
        fl = set()
        while name and name[0] in '/≈~\\^!':
            fl.add(name[0]); name = name[1:]
        pitch = N(name); v = vel + (14 if '!' in fl else 0)
        t0 = hum(b) if hum else b
        if '^' in fl:   # 倚音：上方一个五声音阶的邻音，占 0.08 拍
            g = 0.09; p.bend(t0 - 0.001, 0, bend_rng); p.note(t0, g, pitch + 2, v - 10); t0 += g; d -= g
        if '≈' in fl and prev is not None and prev != pitch:
            st = prev - pitch; p.bend(t0 - 0.002, st, bend_rng)
            for k in range(1, 9): p.bend(t0 + slide * k / 8, st * (1 - (k / 8) ** 0.7), bend_rng)
        elif '/' in fl:
            p.bend(t0 - 0.002, -1.6, bend_rng)
            for k in range(1, 7): p.bend(t0 + slide * 0.8 * k / 6, -1.6 * (1 - (k / 6) ** 0.8), bend_rng)
        else:
            p.bend(t0 - 0.002, 0, bend_rng)
        p.note(t0, d * legato, pitch, v)
        sec = d * 60 / p.bpm
        if ('~' in fl or sec >= vib_min) and vib > 0:   # 揉弦：延迟起振，幅度慢慢加大
            cyc = vib_hz * 60 / p.bpm; st = t0 + d * 0.35; steps = int((d * 0.6) * cyc * 12)
            for k in range(steps):
                tt = st + k / (cyc * 12); depth = vib * min(1, k / (cyc * 12 * 0.5 + 1))
                p.bend(tt, depth * np.sin(2 * np.pi * k / 12), bend_rng)
            p.bend(t0 + d * 0.97, 0, bend_rng)
        if '\\' in fl:
            for k in range(1, 7): p.bend(t0 + d * 0.8 + d * 0.18 * k / 6, -2.5 * (k / 6) ** 1.5, bend_rng)
            p.bend(t0 + d + 0.01, 0, bend_rng)
        prev = pitch; b += d
    return b


def arp(p, beat, notes, pattern, step, dur=None, vel=80, accent=None, hum=None, vel_jit=6, rng=None):
    """按 pattern（下标列表，None 是休止）在 notes 上琶音，每步 step 拍"""
    rng = rng or np.random.default_rng(0)
    for i, k in enumerate(pattern):
        if k is None: continue
        t = beat + i * step; t = hum(t) if hum else t
        v = vel + (accent[i % len(accent)] if accent else 0) + rng.integers(-vel_jit, vel_jit + 1)
        p.note(t, dur or step * 1.6, notes[k % len(notes)] + 12 * (k // len(notes)), v)
    return beat + len(pattern) * step


def block(p, beat, notes, dur, vel=80, roll=0.0, hum=None):
    for i, n in enumerate(notes):
        t = beat + i * roll; p.note(hum(t) if hum else t, dur - i * roll, n, vel)


def swell(p, b0, b1, v0, v1, num=2, steps=24):
    for i in range(steps + 1):
        t = i / steps; p.cc(b0 + (b1 - b0) * t, num, v0 + (v1 - v0) * (t if v1 >= v0 else t ** 0.8))

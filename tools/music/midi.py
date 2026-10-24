"""最小的 MIDI 写入：一首曲子 = 若干声部；每个声部一个通道、一个音色，事件按拍（浮点）记"""
import struct

def vlq(n):
    n = int(n); out = [n & 0x7F]; n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80); n >>= 7
    return bytes(reversed(out))

class Part:
    def __init__(self, name, program, ch=0, bank=0, vol=100, pan=64, rev=0, cho=0):
        self.name, self.program, self.ch, self.bank = name, program, ch, bank
        self.ev = []   # (beat, order, bytes)
        self.cc(0, 7, vol); self.cc(0, 10, pan); self.cc(0, 91, rev); self.cc(0, 93, cho); self.cc(0, 11, 127)
        self.bend_range(0, 12)
    def raw(self, beat, data, order=1): self.ev.append((beat, order, bytes(data)))
    def cc(self, beat, num, val): self.raw(beat, [0xB0 | self.ch, num, max(0, min(127, int(val)))], 0)
    def bend(self, beat, semis, rng=12):
        v = int(round(8192 + 8191 * max(-1, min(1, semis / rng)))); v = max(0, min(16383, v))
        self.raw(beat, [0xE0 | self.ch, v & 0x7F, v >> 7], 0)
    def bend_range(self, beat, semis):
        for n, v in ((101, 0), (100, 0), (6, semis), (38, 0), (101, 127), (100, 127)): self.cc(beat, n, v)
    def note(self, beat, dur, pitch, vel=90):
        p = int(pitch)
        if not 0 <= p <= 127: return
        self.raw(beat, [0x90 | self.ch, p, max(1, min(127, int(vel)))], 2)
        self.raw(beat + max(0.01, dur), [0x80 | self.ch, p, 0], 1)
    def expr_ramp(self, b0, b1, v0, v1, steps=16, num=11):
        for i in range(steps + 1):
            t = i / steps; self.cc(b0 + (b1 - b0) * t, num, v0 + (v1 - v0) * t)

def write(path, parts, bpm, ppq=480, tempo_map=None):
    def trk(evs):
        evs.sort(key=lambda e: (e[0], e[1])); out = b''; last = 0
        for beat, _, data in evs:
            t = int(round(beat * ppq)); out += vlq(max(0, t - last)) + data; last = max(last, t)
        out += b'\x00\xFF\x2F\x00'
        return b'MTrk' + struct.pack('>I', len(out)) + out
    tempo = [(0, 0, b'\xFF\x51\x03' + struct.pack('>I', int(60_000_000 / bpm))[1:])]
    for b, t in (tempo_map or []): tempo.append((b, 0, b'\xFF\x51\x03' + struct.pack('>I', int(60_000_000 / t))[1:]))
    tracks = [trk(tempo)]
    for p in parts:
        evs = list(p.ev)
        if p.ch != 9:
            evs.append((0, -2, bytes([0xB0 | p.ch, 0, p.bank])))
            evs.append((0, -1, bytes([0xC0 | p.ch, p.program])))
        else:
            evs.append((0, -1, bytes([0xC0 | p.ch, p.program])))
        tracks.append(trk(evs))
    with open(path, 'wb') as f:
        f.write(b'MThd' + struct.pack('>IHHH', 6, 1, len(tracks), ppq) + b''.join(tracks))

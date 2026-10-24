"""每个声部在各倍频程占多少能量（用 render(keep=True) 留下的分轨 wav，按声部自己的均衡、增益处理后算）
用法：python3 stems.py 模块 构建函数 [参数...]   例：python3 stems.py battle build"""
import sys, os, importlib, numpy as np
import mixlib as mx
from mixlib import SR
mod, fn = sys.argv[1], sys.argv[2]
args = [eval(a) for a in sys.argv[3:]]
s = getattr(importlib.import_module(mod), fn)(*args)
work = os.path.join(mx.OUT, s.name)
bands = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
rows = []; tot = None
for i, (p, o) in enumerate(s.parts):
    wav = os.path.join(work, f'{i:02d}-{p.name}.wav')
    if not os.path.exists(wav): continue
    x = mx.load(wav)
    if o['eq']: x = mx.eq(x, o['eq'])
    if o['sat']: x = mx.sat(x, o['sat'])
    if o['comp']: x = mx.compress(x, *o['comp'])
    x = x * mx.db(o['gain'])
    m = x.mean(axis=0)
    F = np.abs(np.fft.rfft(m)) ** 2; f = np.fft.rfftfreq(len(m), 1 / SR)
    e = np.array([F[(f >= b / 1.414) & (f < b * 1.414)].sum() for b in bands])
    kw = (F * mx.eq_curve(f, [('hp', 38, 2), ('hs', 1700, 4)]) ** 2).sum()   # 近似 K 计权（听感响度）
    tot = e if tot is None else tot + e
    rows.append((p.name, e, 10 * np.log10(e.sum() + 1e-12), kw))
T = 10 * np.log10(tot + 1e-12)
KT = sum(r[3] for r in rows)
print('声部       总量  听感  ' + ' '.join(f'{b:>6}' for b in bands))
for name, e, all_, kw in sorted(rows, key=lambda r: -r[3]):
    # 总量：占全部能量的 dB；听感：K 计权后占的百分比；每格：这个声部占这一倍频程总能量的百分比
    print(f'{name:8s} {all_ - 10*np.log10(tot.sum()):6.1f} {100*kw/KT:4.0f}%  ' + ' '.join(f'{100*v/t:5.0f}%' for v, t in zip(e, tot)))
print('合计(相对1k)   ' + ' '.join(f'{v - T[5]:+6.1f}' for v in T))

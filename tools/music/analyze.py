"""看一首曲子：对数频率的频谱图（PNG）、长时平均频谱（每倍频程的能量）、每 2 秒的响度曲线"""
import sys, numpy as np
from PIL import Image
import mixlib as mx
path, png = sys.argv[1], sys.argv[2]
x = mx.load(path); m = x.mean(axis=0); sr = mx.SR
# 频谱图
hop, nfft = 1024, 4096
win = np.hanning(nfft); frames = []
for i in range(0, len(m) - nfft, hop): frames.append(np.abs(np.fft.rfft(m[i:i + nfft] * win)))
S = 20 * np.log10(np.array(frames).T + 1e-9)
f = np.fft.rfftfreq(nfft, 1 / sr)
H = 360; lf = np.geomspace(30, 16000, H); idx = np.searchsorted(f, lf)
img = S[idx][::-1]; img = np.clip((img - (img.max() - 80)) / 80, 0, 1)
W = min(1400, img.shape[1]); cols = np.linspace(0, img.shape[1] - 1, W).astype(int)
im = (img[:, cols] * 255).astype(np.uint8)
rgb = np.stack([im, (im * 0.8).astype(np.uint8), (255 - im) // 3], axis=-1)
Image.fromarray(rgb).save(png)
# 长时平均频谱（每倍频程）
P = (np.array(frames) ** 2).mean(axis=0)
bands = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
out = []
for b in bands:
    sel = (f >= b / 1.414) & (f < b * 1.414); out.append(10 * np.log10(P[sel].sum() + 1e-12))
ref = out[5]
print('倍频程能量(相对 1k):', ' '.join(f'{b}:{v - ref:+.1f}' for b, v in zip(bands, out)))
# 响度曲线（2 秒一格的 RMS）
seg = 2 * sr; r = [20 * np.log10(np.sqrt((m[i:i + seg] ** 2).mean()) + 1e-9) for i in range(0, len(m) - seg + 1, seg)]
print('每2秒RMS:', ' '.join(f'{v:.0f}' for v in r))

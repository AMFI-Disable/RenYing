"""查循环曲的接缝：按 44.1k 原样解码，比较首尾采样的跳变和平时相邻采样差的分布"""
import sys, subprocess, numpy as np
for p in sys.argv[1:]:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-f', 'f32le', '-ac', '2', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.astype(np.float64)
    j = max(abs(x[c, 0] - x[c, -1]) for c in range(2)); d = np.abs(np.diff(x, axis=1))
    print(f'{p}: {x.shape[1]} 采样 ({x.shape[1] / 44100:.4f} 秒)  接缝跳变 {j:.4f}  平时 p99 {np.percentile(d, 99):.4f}  p99.9 {np.percentile(d, 99.9):.4f}')

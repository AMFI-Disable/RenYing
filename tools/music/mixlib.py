"""混音小工具：读 fluidsynth 渲染的分轨、频域均衡、卷积混响、压缩、限幅、合成打击乐和氛围层、编码 mp3"""
import os, subprocess, json, re
import numpy as np

SR = 48000
SF = os.environ.get('MUSIC_SF', '/usr/share/sounds/sf3/MuseScore_General_Full.sf3')   # MuseScore General 音色库
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def db(x): return 10 ** (x / 20)


# ---------------- 读写 ----------------
def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.astype(np.float64)


def render(mid, wav, sf=SF, gain=0.6):
    subprocess.run(['fluidsynth', '-ni', '-q', '-g', str(gain), '-R', '0', '-C', '0', '-r', str(SR), '-O', 'float', '-T', 'wav', '-F', wav, sf, mid], check=True, capture_output=True)
    return load(wav)


def save_wav(path, x):
    x = np.clip(x, -1, 1).astype(np.float32)
    p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', path], input=x.T.tobytes(), check=True)


def resample(x, sr_out=44100, loop=False):
    """频域重采样到 sr_out。循环曲当作周期信号整段变换，输出正好 round(长度 × 比例) 个采样、首尾仍然无缝；
       短曲先在后面补零，免得尾巴绕回开头。（以前交给 ffmpeg 重采样，有一首末尾多出 47 个近乎无声的采样，循环时会咔哒一下）"""
    n = x.shape[1]; m = int(round(n * sr_out / SR))
    if not loop:
        pad = SR // 10; y = resample(np.pad(x, ((0, 0), (0, pad))), sr_out, True); return y[:, :m]
    X = np.fft.rfft(x, axis=1); k = m // 2 + 1
    Y = np.zeros((x.shape[0], k), dtype=complex); c = min(k, X.shape[1]); Y[:, :c] = X[:, :c]
    return np.fft.irfft(Y, m, axis=1) * (m / n)


def encode_mp3(x, path, kbps=144, loop=False):
    y = resample(x, 44100, loop)
    y = np.clip(y, -1, 1).astype(np.float32)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', '44100', '-ac', '2', '-i', '-', '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', path], input=y.T.tobytes(), check=True)


def lufs(x):
    p = subprocess.run(['ffmpeg', '-nostats', '-hide_banner', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-af', 'ebur128=peak=true', '-f', 'null', '-'], input=np.clip(x, -4, 4).astype(np.float32).T.tobytes(), capture_output=True)
    s = p.stderr.decode(errors='ignore'); s = s[s.rfind('Summary'):]
    i = float(re.search(r'I:\s+(-?[\d.]+) LUFS', s).group(1)); pk = float(re.search(r'Peak:\s+(-?[\d.inf]+) dBFS', s).group(1))
    return i, pk


# ---------------- 基本处理 ----------------
def fit(x, n):
    if x.shape[1] >= n: return x[:, :n]
    return np.pad(x, ((0, 0), (0, n - x.shape[1])))


def pan(x, p):
    """p: -1 左 … 1 右；对立体声分轨做平衡（等功率）"""
    a = (p + 1) * np.pi / 4
    return np.stack([x[0] * np.cos(a) * 1.4142, x[1] * np.sin(a) * 1.4142])


def width(x, w):
    m, s = (x[0] + x[1]) / 2, (x[0] - x[1]) / 2 * w
    return np.stack([m + s, m - s])


def eq_curve(f, bands):
    g = np.zeros_like(f)   # dB
    lin = np.ones_like(f)
    lf = np.log2(np.maximum(f, 1.0))
    for b in bands:
        t = b[0]
        if t == 'hp':
            fc, n = b[1], (b[2] if len(b) > 2 else 2); lin *= 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * n))
        elif t == 'lp':
            fc, n = b[1], (b[2] if len(b) > 2 else 2); lin *= 1 / np.sqrt(1 + (f / fc) ** (2 * n))
        elif t == 'peak':
            f0, gd, bw = b[1], b[2], (b[3] if len(b) > 3 else 1.0)
            g += gd * np.exp(-((lf - np.log2(f0)) ** 2) / (2 * (bw / 2.355) ** 2))
        elif t == 'ls':
            f0, gd = b[1], b[2]; g += gd / (1 + np.exp((lf - np.log2(f0)) * 4))
        elif t == 'hs':
            f0, gd = b[1], b[2]; g += gd / (1 + np.exp(-(lf - np.log2(f0)) * 4))
    return lin * db(g)


def eq(x, bands):
    n = x.shape[1]; N = int(2 ** np.ceil(np.log2(n + 1)))
    X = np.fft.rfft(x, N, axis=1); f = np.fft.rfftfreq(N, 1 / SR)
    return np.fft.irfft(X * eq_curve(f, bands), N, axis=1)[:, :n]


def conv(x, ir):
    """x: 2×n，ir: 2×m → 2×(n+m-1)；左进左、右进右，再各混一点对面的"""
    n, m = x.shape[1], ir.shape[1]; N = int(2 ** np.ceil(np.log2(n + m)))
    X = np.fft.rfft(x, N, axis=1); H = np.fft.rfft(ir, N, axis=1)
    yl = X[0] * H[0] * 0.8 + X[1] * H[0] * 0.2
    yr = X[1] * H[1] * 0.8 + X[0] * H[1] * 0.2
    return np.stack([np.fft.irfft(yl, N)[:n + m - 1], np.fft.irfft(yr, N)[:n + m - 1]])


def make_ir(rt=2.4, pre=0.02, damp=0.5, seed=1, er=True, bright=1.0):
    """人工混响的冲激响应：早期反射 + 按频段衰减的尾巴（高频衰减更快），左右不相关"""
    r = np.random.default_rng(seed)
    L = int((rt * 1.6 + pre + 0.1) * SR); t = np.arange(L) / SR
    out = np.zeros((2, L))
    edges = [0, 250, 800, 2500, 6000, 12000, 24000]
    for ch in range(2):
        noise = r.standard_normal(L)
        Nf = np.fft.rfft(noise); f = np.fft.rfftfreq(L, 1 / SR)
        tail = np.zeros(L)
        for lo, hi in zip(edges[:-1], edges[1:]):
            band = np.fft.irfft(Nf * ((f >= lo) & (f < hi)), L)
            fc = np.sqrt(max(lo, 60) * hi)
            rtb = rt * (1.15 if fc < 300 else 1.0 if fc < 2000 else (1 - damp * 0.35) if fc < 6000 else (1 - damp * 0.6))
            gb = 1.0 if fc < 6000 else bright * 0.8
            tail += band * np.exp(-6.9 * np.maximum(t - pre, 0) / rtb) * gb
        tail *= np.clip((t - pre) / 0.03, 0, 1)
        out[ch] = tail
    if er:
        for k in range(14):
            d = pre * 0.4 + r.uniform(0.004, pre + 0.05); a = r.uniform(0.25, 0.7) * (1 - k / 18)
            i = int(d * SR)
            if i < L: out[r.integers(0, 2), i] += a * 6 * r.choice([-1, 1])
    e = np.sqrt((out ** 2).sum() / 2)
    return out / e * 0.08


IRS = {}
def reverb(x, kind='hall', mix=0.25):
    if kind not in IRS:
        IRS[kind] = {'hall': lambda: make_ir(2.8, 0.028, 0.55, 11), 'room': lambda: make_ir(1.1, 0.012, 0.6, 12),
                     'plate': lambda: make_ir(1.8, 0.008, 0.3, 13, er=False, bright=1.2), 'cave': lambda: make_ir(4.2, 0.05, 0.6, 14)}[kind]()
    y = conv(x, IRS[kind])
    return y * mix


def env_follow(x, win):
    p = (x ** 2).mean(axis=0)
    c = np.cumsum(np.concatenate([[0], p]))
    w = max(1, int(win))
    rms = np.sqrt(np.maximum((c[w:] - c[:-w]) / w, 1e-12))
    return np.concatenate([np.full(w - 1, rms[0]), rms])


def smooth_gain(g, att, rel, hop):
    """每 hop 个采样算一次的增益序列，按起音 / 释放时间做单极平滑（往下快、往上慢）"""
    a = np.exp(-hop / (SR * att)); r = np.exp(-hop / (SR * rel)); out = np.empty_like(g); s = 1.0
    for i, v in enumerate(g):
        s = a * s + (1 - a) * v if v < s else r * s + (1 - r) * v
        out[i] = s
    return out


def compress(x, thr=-18, ratio=2.5, att=0.012, rel=0.18, knee=6, makeup=0.0, hop=64):
    e = env_follow(x, SR * 0.01)[::hop]
    lv = 20 * np.log10(np.maximum(e, 1e-9))
    over = lv - thr
    red = np.where(over <= -knee / 2, 0, np.where(over >= knee / 2, over * (1 - 1 / ratio), (over + knee / 2) ** 2 / (2 * knee) * (1 - 1 / ratio)))
    g = smooth_gain(db(-red), att, rel, hop)
    gf = np.interp(np.arange(x.shape[1]), np.arange(len(g)) * hop, g)
    return x * gf * db(makeup)


def true_peak(x):
    """四倍过采样估计的真峰值（每个采样位置取它和后面三个插值点里最大的），2×n → n"""
    k = np.arange(-12, 13); pk = np.abs(x).max(axis=0)
    for ph in (0.25, 0.5, 0.75):
        h = np.sinc(k + ph) * np.kaiser(len(k), 8.0); h /= h.sum()
        for ch in range(x.shape[0]):
            pk = np.maximum(pk, np.abs(np.convolve(x[ch], h[::-1], 'same')))
    return pk


def limit(x, ceil=-1.3, look=0.005, rel=0.12, hop=16):
    """前瞻限幅：按真峰值算每一小段需要的增益，先取前后 look 秒里的最小值、再做同样长度的平均，
       这样增益在峰值到来之前已经压到位（不靠削波）；回升按 rel 慢慢放开"""
    c = db(ceil); n = x.shape[1]
    pk = true_peak(x)
    nb = int(np.ceil(n / hop)); pp = np.pad(pk, (0, nb * hop - n)).reshape(nb, hop).max(axis=1)
    need = np.minimum(1, c / np.maximum(pp, 1e-9))
    L = max(1, int(look * SR / hop))
    from numpy.lib.stride_tricks import sliding_window_view as win
    m = win(np.pad(need, (L, L), constant_values=1), 2 * L + 1).min(axis=1)
    sm = win(np.pad(m, (L, L), mode='edge'), 2 * L + 1).mean(axis=1)
    r = np.exp(-hop / (SR * rel)); g = np.empty_like(sm); st = 1.0
    for i, v in enumerate(sm):
        st = v if v < st else r * st + (1 - r) * v
        g[i] = st
    gf = np.interp(np.arange(n), np.arange(nb) * hop + hop / 2, g)
    y = x * gf
    return np.clip(y, -1, 1)


def sat(x, drive=1.5):
    return np.tanh(x * drive) / np.tanh(drive)


# ---------------- 合成层 ----------------
def t_of(sec): return np.arange(int(sec * SR)) / SR


def place(buf, sig, at):
    """把 sig（2×m 或 m）放到 buf 的第 at 秒（超出的部分绕回开头，循环曲用）"""
    if sig.ndim == 1: sig = np.stack([sig, sig])
    i = int(round(at * SR)); n = buf.shape[1]; m = sig.shape[1]
    for k in range(0, m, n):
        seg = sig[:, k:k + n]; j = (i + k) % n; e = min(n, j + seg.shape[1])
        buf[:, j:e] += seg[:, :e - j]
        if seg.shape[1] > e - j: buf[:, :seg.shape[1] - (e - j)] += seg[:, e - j:]


def sub_hit(f0=52, f1=32, dur=2.2, amp=0.9):
    t = t_of(dur); f = f1 + (f0 - f1) * np.exp(-t * 9)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-t * 2.2) * amp
    y += np.sin(ph * 2) * np.exp(-t * 6) * amp * 0.25
    click = rng.standard_normal(len(t)) * np.exp(-t * 300) * 0.25
    return sat(y + click, 1.3)


def boom(dur=3.0, amp=0.8):
    """电影感低频冲击：亚低频 + 一层滤过的噪声爆裂"""
    t = t_of(dur)
    s = sub_hit(48, 28, dur, amp)
    n = rng.standard_normal(len(t)) * np.exp(-t * 7) * 0.35
    n = eq(np.stack([n, n]), [('lp', 900, 2), ('hp', 60, 2)])[0]
    return s + n


def riser(dur=2.0, amp=0.35, f0=300, f1=6000):
    t = t_of(dur); n = rng.standard_normal((2, len(t)))
    # 分段带通：频率随时间升高
    seg = 32; out = np.zeros_like(n); L = len(t)
    for k in range(seg):
        a, b = k * L // seg, (k + 1) * L // seg
        fc = f0 * (f1 / f0) ** (k / seg)
        win = np.zeros(L); lo = max(0, a - L // seg); hi = min(L, b + L // seg)
        win[lo:hi] = np.hanning(hi - lo)
        out += eq(n * win, [('hp', fc * 0.5, 2), ('lp', fc * 1.6, 2)])
    e = (t / dur) ** 2.2
    tone = np.sin(2 * np.pi * np.cumsum(110 * (1 + 3 * (t / dur) ** 2)) / SR) * 0.15
    return (out * e + np.stack([tone, tone]) * e) * amp


def reverse_swell(dur=1.6, amp=0.35):
    t = t_of(dur); n = rng.standard_normal((2, len(t)))
    n = eq(n, [('hp', 2500, 2), ('peak', 7000, 4, 1.5)])
    return n * (t / dur) ** 3 * amp


def gong(f0=110, dur=6.0, amp=0.5, bend=-0.04):
    """大锣：一串不和谐泛音，起音时先涨后落（音高略往下滑），带拍频"""
    t = t_of(dur); y = np.zeros(len(t))
    ratios = [1, 1.52, 2.03, 2.61, 3.17, 3.92, 4.8, 5.6, 6.9, 8.3]
    for k, r in enumerate(ratios):
        f = f0 * r * (1 + bend * np.exp(-t * 3)); det = 1 + rng.uniform(-0.003, 0.003)
        ph = 2 * np.pi * np.cumsum(f * det) / SR
        a = (0.9 ** k) * (1 - np.exp(-t * (6 + k * 3))) * np.exp(-t * (0.5 + k * 0.18))
        y += np.sin(ph + rng.uniform(0, 6)) * a * (1 + 0.3 * np.sin(2 * np.pi * (0.7 + k * 0.23) * t))
    sh = rng.standard_normal(len(t)); sh = eq(np.stack([sh, sh]), [('hp', 3000, 2), ('lp', 9000, 2)])[0] * np.exp(-t * 1.2) * (1 - np.exp(-t * 10)) * 0.15
    y = (y / len(ratios) * 2 + sh) * amp
    return np.stack([y, np.roll(y, 37)])


def wind(dur, amp=0.12, seed=3):
    r = np.random.default_rng(seed); t = t_of(dur); n = r.standard_normal((2, len(t)))
    out = np.zeros_like(n)
    for k, fc in enumerate([300, 600, 1200, 2400]):
        lfo = 0.5 + 0.5 * np.sin(2 * np.pi * (0.05 + 0.03 * k) * t + r.uniform(0, 6))
        out += eq(n, [('hp', fc * 0.7, 2), ('lp', fc * 1.4, 2)]) * lfo / (k + 1)
    return out * amp


def drone(freqs, dur, amp=0.12, cutoff=900, seed=5):
    """暗色长音：几支略走音的锯齿波过低通，慢慢起伏"""
    r = np.random.default_rng(seed); t = t_of(dur); y = np.zeros((2, len(t)))
    for f in freqs:
        for ch in range(2):
            for det in (-0.12, 0.0, 0.11):
                ff = f * 2 ** (det / 12 + r.uniform(-0.01, 0.01) / 12)
                ph = (ff * t + r.uniform(0, 1)) % 1.0
                y[ch] += (2 * ph - 1) * 0.3
    y = eq(y, [('lp', cutoff, 2), ('hp', 40, 2)])
    lfo = 0.75 + 0.25 * np.sin(2 * np.pi * 0.07 * t)
    return y * lfo * amp / max(1, len(freqs))


def fade(x, fin=0.0, fout=0.0):
    n = x.shape[1]; g = np.ones(n)
    if fin > 0: k = int(fin * SR); g[:k] *= np.linspace(0, 1, k) ** 2
    if fout > 0: k = int(fout * SR); g[-k:] *= np.linspace(1, 0, k) ** 1.5
    return x * g


def master(x, target=-17.0, ceil=-1.3, air=2.2, glue=True):
    x = eq(x, [('hp', 28, 3), ('peak', 280, -1.0, 1.2), ('peak', 620, -1.3, 1.2), ('hs', 9000, air)])
    if glue: x = compress(x, thr=-16, ratio=1.8, att=0.02, rel=0.25, knee=8)
    x = limit(x * db(-3), ceil)
    for _ in range(3):
        i, pk = lufs(x)
        g = target - i
        if abs(g) < 0.25: break
        x = limit(x * db(g), ceil)
    return x

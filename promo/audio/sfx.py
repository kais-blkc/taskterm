"""Синтез звуковых эффектов (без внешних файлов и лицензий). Всё — моно, 44.1 кГц, float [-1, 1]."""
import numpy as np

SR = 44100
rng = np.random.default_rng(7)


def add(*xs):
    """Сумма звуков разной длины (короткие дополняются тишиной)."""
    n = max(len(x) for x in xs)
    out = np.zeros(n)
    for x in xs:
        out[: len(x)] += x
    return out


def t_(dur):
    return np.arange(int(SR * dur)) / SR


def env(n, decay, attack=0.002):
    t = np.arange(n) / SR
    a = np.minimum(1.0, t / max(attack, 1e-4))
    return a * np.exp(-t / decay)


def sine(freq, dur, decay, gain=1.0):
    t = t_(dur)
    f = freq if np.isscalar(freq) else freq
    return gain * np.sin(2 * np.pi * np.cumsum(np.broadcast_to(f, t.shape)) / SR) * env(len(t), decay)


def noise_burst(dur, decay, gain=1.0, hp=0.0):
    n = int(SR * dur)
    x = rng.standard_normal(n)
    if hp:
        x = x - np.convolve(x, np.ones(int(hp)) / hp, mode='same')
    return gain * x * env(n, decay, 0.0005)


def lowpass_sweep(x, f0, f1):
    """Однополюсный ФНЧ с плавно меняющейся частотой среза."""
    n = len(x)
    fc = np.linspace(f0, f1, n)
    a = 1 - np.exp(-2 * np.pi * fc / SR)
    y = np.empty(n)
    acc = 0.0
    for i in range(n):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def whoosh(dur=0.42, rising=True):
    x = rng.standard_normal(int(SR * dur))
    f0, f1 = (500, 4200) if rising else (4200, 500)
    y = lowpass_sweep(x, f0, f1)
    y = y - lowpass_sweep(x, f0 * 0.25, f1 * 0.25)  # убираем низы — получается «воздух»
    shape = np.sin(np.pi * np.linspace(0, 1, len(y))) ** 2
    return 0.55 * y * shape / (np.max(np.abs(y)) + 1e-9)


def click():
    down = add(noise_burst(0.012, 0.003, 0.5, hp=8), sine(2400, 0.02, 0.006, 0.5))
    up = add(noise_burst(0.01, 0.002, 0.25, hp=8), sine(1800, 0.015, 0.005, 0.25))
    out = np.zeros(int(SR * 0.12))
    out[: len(down)] += down
    out[int(SR * 0.075) : int(SR * 0.075) + len(up)] += up
    return 0.7 * out


def tick(freq=1900):
    return 0.35 * add(sine(freq, 0.02, 0.005), noise_burst(0.01, 0.002, 0.4, hp=6))


def type_ticks(dur, n):
    out = np.zeros(int(SR * (dur + 0.05)))
    for i in range(n):
        at = (i + rng.uniform(-0.25, 0.25)) / max(n, 1) * dur
        k = 0.5 * tick(rng.uniform(1500, 2300)) * rng.uniform(0.6, 1.0)
        s = int(max(0, at) * SR)
        out[s : s + len(k)] += k[: len(out) - s]
    return out


def pop():
    glide = np.linspace(420, 900, int(SR * 0.09))
    return 0.55 * add(sine(glide, 0.09, 0.05), noise_burst(0.006, 0.0015, 0.25, hp=6))


def check():
    return 0.5 * add(sine(np.linspace(1500, 2300, int(SR * 0.08)), 0.08, 0.04), sine(3100, 0.05, 0.02, 0.25))


def ok():
    a = sine(523, 0.12, 0.06, 0.5)
    b = sine(784, 0.2, 0.09, 0.5)
    out = np.zeros(int(SR * 0.32))
    out[: len(a)] += a
    out[int(SR * 0.07) : int(SR * 0.07) + len(b)] += b
    return 0.6 * out


def chime():
    out = np.zeros(int(SR * 1.1))
    for i, (f, g) in enumerate([(659, 0.5), (830, 0.45), (988, 0.5)]):
        s = int(SR * 0.09 * i)
        tone = add(sine(f, 0.9, 0.28, g), sine(f * 2, 0.6, 0.12, g * 0.25))
        out[s : s + len(tone)] += tone[: len(out) - s]
    return 0.55 * out


def ping():
    out = np.zeros(int(SR * 1.0))
    for f, s0, g in [(1047, 0.0, 0.5), (1568, 0.11, 0.42)]:
        tone = add(sine(f, 0.8, 0.22, g), sine(f * 2.76, 0.4, 0.05, g * 0.2))
        s = int(SR * s0)
        out[s : s + len(tone)] += tone[: len(out) - s]
    return 0.6 * out


def thud(freq=95, decay=0.12, gain=0.7):
    return gain * add(sine(np.linspace(freq * 1.6, freq, int(SR * 0.2)), 0.2, decay), noise_burst(0.012, 0.003, 0.35))


def lift():
    return 0.5 * add(sine(np.linspace(180, 320, int(SR * 0.16)), 0.16, 0.08, 0.6), whoosh(0.18, True) * 0.5)


def keypress():
    return 0.8 * add(thud(210, 0.05, 0.6), noise_burst(0.015, 0.004, 0.3, hp=5))


def sweep():
    return 0.45 * whoosh(0.26, True)


def send():
    w = whoosh(0.22, True) * 0.55
    p = pop()
    out = np.zeros(int(SR * 0.4))
    out[: len(w)] += w
    out[int(SR * 0.16) : int(SR * 0.16) + len(p)] += p
    return out


def boot():
    n = int(SR * 0.8)
    glide = np.linspace(70, 210, n)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * np.cumsum(glide) / SR) * np.sin(np.pi * t / 0.8) ** 1.5
    return add(0.45 * tone, 0.12 * whoosh(0.8, True))


def beep():
    t = t_(0.07)
    return 0.25 * np.sign(np.sin(2 * np.pi * 880 * t)) * env(len(t), 0.04) * 0.6


BANK = {
    'click': click, 'pop': pop, 'tick': tick, 'check': check, 'ok': ok, 'chime': chime, 'ping': ping,
    'whoosh': whoosh, 'sweep': sweep, 'send': send, 'lift': lift, 'drop': thud, 'keypress': keypress,
    'boot': boot, 'beep': beep,
}
# относительная громкость эффектов
GAIN = {
    'click': 0.9, 'pop': 0.8, 'tick': 0.7, 'check': 0.9, 'ok': 0.8, 'chime': 0.85, 'ping': 1.0, 'whoosh': 0.55,
    'sweep': 0.6, 'send': 0.85, 'lift': 0.8, 'drop': 0.95, 'keypress': 0.9, 'boot': 0.7, 'beep': 0.7,
}

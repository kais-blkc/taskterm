"""Сборка звуковой дорожки: голос (macOS say) + синтезированные эффекты по меткам из marks.json.

Использование (из папки promo):
  .venv-audio/bin/python audio/build.py --video taskterm-promo-silent.mp4 --out taskterm-promo.mp4
  .venv-audio/bin/python audio/build.py --video taskterm-promo-silent.mp4 --report     # только отчёт по таймингам
"""
import argparse, hashlib, json, subprocess, sys
from pathlib import Path

import numpy as np

import sfx

SR = sfx.SR
HERE = Path(__file__).resolve().parent
BUILD = HERE / 'build'


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def probe_duration(path):
    out = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)])
    return float(out.stdout.decode().strip())


def synth_voice(line_id, text, voice, rate):
    """Голосовая реплика → float-массив; результат кешируется по тексту/голосу/скорости."""
    BUILD.mkdir(exist_ok=True, parents=True)
    key = hashlib.sha1(f'{voice}|{rate}|{text}'.encode()).hexdigest()[:10]
    raw = BUILD / f'voice_{line_id}_{key}.raw'
    if not raw.exists():
        aiff = BUILD / f'voice_{line_id}.aiff'
        run(['say', '-v', voice, '-r', str(rate), '-o', str(aiff), text])
        pcm = run(['ffmpeg', '-v', 'error', '-i', str(aiff), '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'])
        raw.write_bytes(pcm.stdout)
    x = np.frombuffer(raw.read_bytes(), dtype=np.int16).astype(np.float64) / 32768.0
    # обрезаем тишину по краям, оставляем короткий «воздух»
    idx = np.where(np.abs(x) > 0.012)[0]
    if len(idx):
        x = x[max(0, idx[0] - int(0.03 * SR)) : idx[-1] + int(0.08 * SR)]
    return x


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--video', required=True)
    ap.add_argument('--out')
    ap.add_argument('--report', action='store_true')
    ap.add_argument('--marks', default=str(HERE / 'marks.json'))
    a = ap.parse_args()

    marks = sorted(json.loads(Path(a.marks).read_text()).values(), key=lambda m: m['t'])
    cfg = json.loads((HERE / 'voice.json').read_text())
    total = probe_duration(a.video)

    # --- голос ---
    cues = [(m['t'], m['kind'].split(':', 1)[1]) for m in marks if m['kind'].startswith('voice:')]
    voice = np.zeros(int(SR * (total + 1)))
    placed = []
    for i, (t, vid) in enumerate(cues):
        clip = synth_voice(vid, cfg['lines'][vid], cfg['voice'], cfg['rate'])
        s = int(t * SR)
        voice[s : s + len(clip)] += clip[: len(voice) - s]
        end = t + len(clip) / SR
        nxt = cues[i + 1][0] if i + 1 < len(cues) else total
        placed.append((vid, t, end, nxt))

    print(f'видео {total:.1f}с, реплик {len(placed)}')
    bad = 0
    for vid, t, end, nxt in placed:
        slack = nxt - end
        flag = '' if slack >= 0.25 else '   <-- НАЛОЖЕНИЕ / нет паузы'
        bad += bool(flag)
        print(f'  {vid:6s} {t:6.2f} → {end:6.2f}   до следующей реплики/конца: {slack:5.2f}с{flag}')
    if a.report:
        sys.exit(1 if bad else 0)

    # --- эффекты ---
    fx = np.zeros_like(voice)
    counts = {}
    for m in marks:
        kind = m['kind']
        if kind.startswith('voice:'):
            continue
        s = int(m['t'] * SR)
        if kind.startswith('type'):
            n_chars = int(kind.split(':')[1]) if ':' in kind else int(m.get('v', 1) * 16)
            clip = sfx.type_ticks(m['v'], max(2, min(n_chars, int(m['v'] * 24)))) * 0.8
            gain = 0.85
        elif kind in sfx.BANK:
            clip = sfx.BANK[kind]()
            gain = sfx.GAIN[kind]
        else:
            print('неизвестный эффект:', kind)
            continue
        counts[kind] = counts.get(kind, 0) + 1
        if s < len(fx):
            fx[s : s + len(clip)] += gain * clip[: len(fx) - s]
    print('эффекты:', ', '.join(f'{k}×{v}' for k, v in sorted(counts.items())))

    # --- ducking: эффекты тише, пока говорит диктор ---
    win = int(0.08 * SR)
    active = (np.convolve(np.abs(voice), np.ones(win) / win, mode='same') > 0.015).astype(np.float64)
    sm = int(0.2 * SR)
    active = np.convolve(active, np.ones(sm) / sm, mode='same')
    duck = 1.0 - 0.7 * np.clip(active * 1.4, 0, 1)

    mix = 1.0 * voice + 0.75 * fx * duck
    peak = np.max(np.abs(mix)) or 1.0
    mix = mix / peak * 0.9
    mix = mix[: int(total * SR)]
    wav = BUILD / 'mix.raw'
    wav.write_bytes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', str(wav), str(BUILD / 'mix.wav')])

    if a.out:
        run([
            'ffmpeg', '-v', 'error', '-y', '-i', a.video, '-i', str(BUILD / 'mix.wav'),
            '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
            '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
            '-shortest', a.out,
        ])
        print('готово:', a.out)


if __name__ == '__main__':
    main()

let ctx: AudioContext | null = null;

/** Короткий двойной «блип» без звукового файла (Web Audio). Браузер может молчать, пока пользователь не кликал по странице — тогда тихо ничего не делаем */
export function playMessageSound(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    for (const [i, freq] of [880, 1175].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  } catch {
    /* нет Web Audio или запрещён автозапуск — не критично */
  }
}

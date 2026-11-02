import { makeScene2D, Rect, Txt } from '@motion-canvas/2d';
import { all, createRef, createSignal, waitFor } from '@motion-canvas/core';
import { C, Caption, createCursor, click, moveCursor, showCaption, FONT, mark, typeText } from '../ui';

const THEMES = [
  { name: 'phosphor (dark)', bg: '#0c0d0d', elev: '#151716', fg: '#e6e8e7', mut: '#8b918e', acc: '#33ff99', bor: '#2a2f2c' },
  { name: 'amber (dark)', bg: '#0f0e0c', elev: '#181715', fg: '#ebe8e2', mut: '#98938a', acc: '#ffb000', bor: '#34312b' },
  { name: 'dracula (dark)', bg: '#1e1f29', elev: '#282a36', fg: '#f8f8f2', mut: '#7a7f9c', acc: '#bd93f9', bor: '#44475a' },
  { name: 'paper (light)', bg: '#f6f4ee', elev: '#ffffff', fg: '#1d2420', mut: '#6b746e', acc: '#0a7d4b', bor: '#d5d2c6' },
  { name: 'solarized (light)', bg: '#fdf6e3', elev: '#eee8d5', fg: '#586e75', mut: '#93a1a1', acc: '#268bd2', bor: '#d8d2bd' },
];
const SWATCHES = ['#ff5f56', '#ff8a3d', '#ffb000', '#a3e635', '#33ff99', '#22d3ee', '#4da3ff', '#7c83ff', '#bd93f9', '#e879f9', '#ff5fa2', '#94a3b8'];
const S = (x: number, y: number): [number, number] => [x, y - 30];

export default makeScene2D(function* (view) {
  view.fill(C.bg);
  const bg = createSignal(THEMES[0]!.bg);
  const elev = createSignal(THEMES[0]!.elev);
  const fg = createSignal(THEMES[0]!.fg);
  const mut = createSignal(THEMES[0]!.mut);
  const acc = createSignal(THEMES[0]!.acc);
  const bor = createSignal(THEMES[0]!.bor);
  const mine = createSignal(C.alex);

  const cap = createRef<Rect>();
  const win = createRef<Rect>();
  const panel = createRef<Rect>();
  const pop = createRef<Rect>();
  const themeBtn = createRef<Rect>();
  const hi = createRef<Rect>();
  const sel = createRef<Txt>();
  const swRefs = SWATCHES.map(() => createRef<Rect>());
  const cur = createCursor();

  const t = (text: string, x: number, y: number, fill: any, size = 22, extra: object = {}) => (
    <Txt text={text} x={x} y={y} fill={fill} fontFamily={FONT} fontSize={size} offset={[-1, 0]} {...extra} />
  );
  const card = (x: number, y: number, n: number, title: string, color: any, meta: string, stripe = false) => (
    <Rect x={x} y={y} width={316} height={92} fill={elev} stroke={bor} lineWidth={2}>
      {stripe && <Rect x={-156} width={6} height={92} fill={color} />}
      {t(`#${n}`, -146, -16, mut)}
      {t(title, -100, -16, fg, 21)}
      {t(meta, -146, 24, color, 17)}
    </Rect>
  );

  view.add(
    <Rect ref={win} size={[1500, 800]} y={-30} fill={bg} stroke={bor} lineWidth={2} radius={10} clip opacity={0}>
      {/* шапка */}
      <Rect y={-372} width={1500} height={56} fill={bg} stroke={bor} lineWidth={2}>
        {t('$ taskterm', -726, 0, fg, 24)}
        <Rect ref={themeBtn} x={420} width={96} height={34} stroke={bor} lineWidth={2}>
          <Txt text="theme" fontFamily={FONT} fontSize={22} fill={fg} />
        </Rect>
        {t('@alex', 510, 0, mine, 22)}
        <Rect x={690} width={104} height={34} stroke={bor} lineWidth={2}>
          <Txt text="logout" fontFamily={FONT} fontSize={22} fill={fg} />
        </Rect>
      </Rect>
      {t('← boards', -720, -300, mut)}
      {t('# Задачи', -600, -300, fg)}
      {['Новые (2)', 'В работе (1)', 'На проверке (0)'].map((c, i) => (
        <Rect x={-480 + i * 360} y={20} width={340} height={600} stroke={bor} lineWidth={2}>
          <Rect y={-276} width={340} height={48} stroke={bor} lineWidth={2}>
            {t(`## ${c}`, -154, 0, fg, 21)}
          </Rect>
        </Rect>
      ))}
      {card(-480, -170 + 40, 2, 'Обновить README', mine, '→ @alex (я)', true)}
      {card(-480, -64 + 40, 3, 'Тесты на auth', mut, '→ не назначена')}
      {card(-120, -170 + 40, 1, 'Фикс редиректа', C.bob, '→ @bob', true)}

      {/* панель темы */}
      <Rect ref={panel} x={570} y={-135} width={340} height={300} fill={elev} stroke={acc} lineWidth={2} opacity={0} zIndex={5}>
        <Rect y={-118} width={316} height={46} stroke={bor} lineWidth={2}>
          {t('', -146, 0, fg, 20, { ref: sel })}
        </Rect>
        <Rect ref={hi} y={-66} width={316} height={44} fill={acc} opacity={0} />
        {THEMES.map((th, i) => (
          <Rect y={-66 + i * 44} width={316} height={44}>
            <Rect x={-136} width={52} height={22} fill={th.bg} stroke={th.bor} lineWidth={1}>
              <Rect x={-14} width={10} height={10} fill={th.fg} />
              <Rect x={0} width={10} height={10} fill={th.acc} />
              <Rect x={14} width={10} height={10} fill={th.mut} />
            </Rect>
            <Txt text={th.name} x={-96} fontFamily={FONT} fontSize={20} fill={fg} offset={[-1, 0]} />
          </Rect>
        ))}
      </Rect>

      {/* выбор цвета пользователя */}
      <Rect ref={pop} x={520} y={-205} width={330} height={150} fill={elev} stroke={acc} lineWidth={2} opacity={0} zIndex={5}>
        {t('твой цвет', -150, -52, mut, 19)}
        {SWATCHES.map((c, i) => (
          <Rect ref={swRefs[i]} x={-130 + (i % 6) * 52} y={-8 + Math.floor(i / 6) * 50} width={36} height={36} fill={c} stroke={fg} lineWidth={0} opacity={i === 0 ? 0.25 : 1} />
        ))}
      </Rect>
    </Rect>,
  );
  view.add(<Caption ref={cap} n="07" title="Темы и цвета" sub="наведи на тему — увидишь сразу; у каждого пользователя свой цвет" />);
  view.add(cur.node);

  const apply = (i: number) => {
    const th = THEMES[i]!;
    return all(bg(th.bg, 0.35), elev(th.elev, 0.35), fg(th.fg, 0.35), mut(th.mut, 0.35), acc(th.acc, 0.35), bor(th.bor, 0.35));
  };
  const itemY = (i: number) => -135 - 66 + i * 44; // координаты окна

  sel().text(THEMES[0]!.name);
  cur.ref().position([700, 300]);
  yield* all(win().opacity(1, 0.5), showCaption(cap));
  yield* cur.ref().opacity(1, 0.3);
  mark('voice:cust1');

  yield* moveCursor(cur.ref, ...S(420, -372), 0.8);
  yield* all(click(cur.ref), themeBtn().stroke(C.accent, 0.1));
  mark('pop');
  yield* panel().opacity(1, 0.25);
  hi().opacity(0.25);

  for (const i of [1, 2, 3, 4, 2]) {
    yield* moveCursor(cur.ref, ...S(570, itemY(i)), 0.45);
    hi().y(-66 + i * 44);
    mark('sweep');
    yield* apply(i);
    sel().text(THEMES[i]!.name);
    yield* waitFor(i === 2 && false ? 0 : 0.55);
  }
  yield* click(cur.ref);
  yield* all(panel().opacity(0, 0.25), hi().opacity(0, 0.1), themeBtn().stroke(bor(), 0.2));
  yield* waitFor(0.3);

  // цвет пользователя
  yield* moveCursor(cur.ref, ...S(530, -372), 0.8);
  yield* click(cur.ref);
  mark('pop');
  yield* pop().opacity(1, 0.25);
  mark('voice:cust2');
  const pick = 10;
  yield* moveCursor(cur.ref, ...S(520 - 130 + (pick % 6) * 52, -205 - 8 + Math.floor(pick / 6) * 50), 0.8);
  yield* all(click(cur.ref), swRefs[pick]!().lineWidth(3, 0.1));
  mark('ok');
  yield* mine(SWATCHES[pick]!, 0.4);
  yield* waitFor(0.5);
  yield* pop().opacity(0, 0.25);
  yield* waitFor(2.0);
  yield* view.opacity(0, 0.4);
});

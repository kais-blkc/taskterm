import { Line, makeScene2D, Node, Rect } from '@motion-canvas/2d';
import { all, createRef, easeOutCubic, loop, sequence, waitFor } from '@motion-canvas/core';
import { C, T, TL, mark, typeText } from '../ui';

export default makeScene2D(function* (view) {
  view.fill(C.bg);

  const grid = createRef<Node>();
  const logo = createRef<any>();
  const cursor = createRef<Rect>();
  const tag1 = createRef<any>();
  const tag2 = createRef<any>();
  const chips = createRef<Rect>();

  view.add(
    <Node ref={grid} opacity={0}>
      {Array.from({ length: 25 }, (_, i) => (
        <Line points={[[-960 + i * 80, -540], [-960 + i * 80, 540]]} stroke={C.border} lineWidth={1} opacity={0.55} />
      ))}
      {Array.from({ length: 14 }, (_, i) => (
        <Line points={[[-960, -540 + i * 80], [960, -540 + i * 80]]} stroke={C.border} lineWidth={1} opacity={0.55} />
      ))}
    </Node>,
  );

  view.add(
    <>
      <T ref={logo} y={-110} text="" fontSize={150} fontWeight={700} />
      <Rect ref={cursor} width={34} height={120} y={-110} x={() => logo().x() + logo().width() / 2 + 34} fill={C.accent} />
      <T ref={tag1} y={20} text="Канбан-доски для команды" fontSize={54} fill={C.muted} opacity={0} />
      <T ref={tag2} y={100} text="Обсуждение — прямо внутри задачи" fontSize={54} fill={C.accent} opacity={0} />
      <Rect ref={chips} y={270} layout gap={20} opacity={1}>
        {['доски', 'колонки', 'задачи', 'подзадачи', 'дедлайны', 'комментарии'].map((t) => (
          <Rect padding={[10, 22]} stroke={C.border} lineWidth={2} opacity={0}>
            <T text={t} fontSize={30} />
          </Rect>
        ))}
      </Rect>
    </>,
  );

  // мигающий курсор терминала
  const blink = yield loop(Infinity, function* () {
    yield* cursor().opacity(0, 0).wait(0.5);
    yield* cursor().opacity(1, 0).wait(0.5);
  });
  void blink;

  mark('boot');
  yield* grid().opacity(1, 0.8);
  yield* typeText(logo, '$ taskterm', 1.1);
  yield* waitFor(0.3);
  mark('voice:intro');
  mark('pop');
  yield* all(tag1().opacity(1, 0.6), tag1().y(30, 0.6, easeOutCubic));
  yield* waitFor(0.2);
  mark('pop');
  yield* all(tag2().opacity(1, 0.6), tag2().y(110, 0.6, easeOutCubic));
  for (let i = 0; i < 6; i++) mark('tick', undefined, 0.16 * i);
  yield* sequence(0.16, ...chips().children().map((c) => c.opacity(1, 0.4)));
  yield* waitFor(1.9);
  mark('whoosh');
  yield* all(view.opacity(0, 0.5));
});

import { Line, makeScene2D, Node, Rect, Txt } from '@motion-canvas/2d';
import { all, createRef, easeOutCubic, sequence, waitFor } from '@motion-canvas/core';
import { C, T, TL, mark, typeText } from '../ui';

export default makeScene2D(function* (view) {
  view.fill(C.bg);
  const grid = createRef<Node>();
  const logo = createRef<Txt>();
  const cmd = createRef<Txt>();
  const term = createRef<Rect>();
  const out = [createRef<Txt>(), createRef<Txt>(), createRef<Txt>()];
  const feats = createRef<Rect>();

  view.add(
    <>
      <Node ref={grid} opacity={0}>
        {Array.from({ length: 25 }, (_, i) => (
          <Line points={[[-960 + i * 80, -540], [-960 + i * 80, 540]]} stroke={C.border} lineWidth={1} opacity={0.55} />
        ))}
        {Array.from({ length: 14 }, (_, i) => (
          <Line points={[[-960, -540 + i * 80], [960, -540 + i * 80]]} stroke={C.border} lineWidth={1} opacity={0.55} />
        ))}
      </Node>
      <T ref={logo} y={-300} text="$ taskterm" fontSize={120} fontWeight={700} opacity={0} />
      <Rect ref={term} y={10} width={1100} height={250} fill={C.elev} stroke={C.border} lineWidth={2} opacity={0}>
        <TL ref={cmd} text="" x={-500} y={-80} fontSize={32} />
        <TL ref={out[0]} text="✔ Container taskterm  Started" x={-500} y={-20} fontSize={28} fill={C.muted} opacity={0} />
        <TL ref={out[1]} text="✔ healthy" x={-500} y={30} fontSize={28} fill={C.muted} opacity={0} />
        <TL ref={out[2]} text="→ http://localhost:3100" x={-500} y={85} fontSize={32} fill={C.accent} opacity={0} />
      </Rect>
      <Rect ref={feats} y={250} layout gap={18} wrap="wrap" justifyContent="center" width={1500} opacity={1}>
        {['доски', 'канбан', 'подзадачи', 'дедлайны', 'комментарии', 'живые обновления', 'темы'].map((f) => (
          <Rect padding={[8, 20]} stroke={C.border} lineWidth={2} opacity={0}>
            <T text={f} fontSize={28} />
          </Rect>
        ))}
      </Rect>
      <T y={380} text="Запуск за минуту: один контейнер, данные в томе" fontSize={30} fill={C.muted} />
    </>,
  );

  mark('boot');
  yield* all(grid().opacity(1, 0.6), logo().opacity(1, 0.6), logo().y(-270, 0.6, easeOutCubic), term().opacity(1, 0.6));
  mark('voice:out1', undefined, 0.2);
  yield* typeText(cmd, '$ docker compose up -d', 1.3);
  yield* waitFor(0.3);
  mark('beep');
  yield* out[0]().opacity(1, 0.25);
  yield* waitFor(0.3);
  mark('beep');
  yield* out[1]().opacity(1, 0.25);
  yield* waitFor(0.3);
  mark('chime');
  yield* out[2]().opacity(1, 0.25);
  yield* waitFor(0.8);
  mark('voice:out2');
  for (let i = 0; i < 7; i++) mark('tick', undefined, 0.14 * i);
  yield* sequence(0.14, ...feats().children().map((c) => c.opacity(1, 0.35)));
  yield* waitFor(2.2);
  yield* view.opacity(0, 0.7);
});

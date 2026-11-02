import { makeScene2D, Rect, Txt } from '@motion-canvas/2d';
import { all, createRef, waitFor } from '@motion-canvas/core';
import { AppHeader, Btn, C, Caption, createCursor, Field, click, moveCursor, showCaption, T, TL, Win, mark, typeText } from '../ui';

const rowY = (i: number) => -160 + i * 68;
const S = (x: number, y: number): [number, number] => [x, y - 30]; // координаты окна → сцены

export default makeScene2D(function* (view) {
  view.fill(C.bg);
  const cap = createRef<Rect>();
  const win = createRef<Rect>();
  const cur = createCursor();
  const items = [createRef<Rect>(), createRef<Rect>(), createRef<Rect>()];
  const names = ['Задачи', 'Баги', 'Идеи'];
  const add = createRef<Rect>();
  const field = createRef<Rect>();
  const typed = createRef<Txt>();

  view.add(
    <Win ref={win} w={1500} h={800} y={-30} url="localhost:3100" opacity={0}>
      <Rect y={-400 + 48 + 28}>
        <AppHeader w={1500} />
      </Rect>
      <TL text="$ ls boards/" x={-320} y={-235} fontSize={30} />
      {names.map((n, i) => (
        <Rect ref={items[i]} y={rowY(i)} width={640} height={56} fill={C.elev} stroke={C.border} lineWidth={2} opacity={i === 0 ? 1 : 0}>
          <TL text="├──" x={-290} fill={C.muted} />
          <TL text={n} x={-230} />
          <Btn label="×" danger x={282} w={44} height={34} />
        </Rect>
      ))}
      <Btn ref={add} label="+ board" x={-320 + 70} y={rowY(1) + 4} w={140} height={44} />
      <Field ref={field} textRef={typed} w={640} y={rowY(1)} opacity={0} stroke={C.accent} />
    </Win>,
  );
  view.add(<Caption ref={cap} n="02" title="Доски" sub="для каждой темы своя: задачи, баги, идеи" />);
  view.add(cur.node);

  cur.ref().position([700, 250]);
  yield* all(win().opacity(1, 0.5), showCaption(cap));
  yield* cur.ref().opacity(1, 0.3);
  mark('voice:boards');

  for (const i of [1, 2]) {
    yield* moveCursor(cur.ref, ...S(-250, rowY(i) + 4), 0.7);
    yield* click(cur.ref);
    yield* all(add().opacity(0, 0.12), field().y(rowY(i), 0), field().opacity(1, 0.12));
    yield* typeText(typed, names[i]!, 0.5);
    yield* waitFor(0.25);
    mark('pop');
    yield* all(field().opacity(0, 0.15), items[i]!().opacity(1, 0.3));
    typed().text('');
    add().y(rowY(i + 1) + 4);
    yield* add().opacity(i === 2 ? 0 : 1, 0.25);
  }

  yield* moveCursor(cur.ref, ...S(-250, rowY(0)), 0.7);
  yield* all(items[0]!().stroke(C.accent, 0.15), items[0]!().fill('#1b221e', 0.15));
  yield* click(cur.ref);
  yield* waitFor(0.5);
  yield* view.opacity(0, 0.4);
});

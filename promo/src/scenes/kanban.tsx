import { Circle, makeScene2D, Rect, Txt } from '@motion-canvas/2d';
import { all, createRef, easeInOutCubic, waitFor } from '@motion-canvas/core';
import { AppHeader, Btn, C, Caption, createCursor, Field, click, moveCursor, showCaption, T, TL, Win, mark, typeText } from '../ui';

const COLS = ['Новые', 'В работе', 'На проверке', 'Сделано'];
const colX = (c: number) => -537 + c * 358;
const slot = (c: number, r: number): [number, number] => [colX(c), -125 + r * 106];
const S = (x: number, y: number): [number, number] => [x, y - 30];

export default makeScene2D(function* (view) {
  view.fill(C.bg);
  const cap = createRef<Rect>();
  const win = createRef<Rect>();
  const cur = createCursor();
  const heads = COLS.map(() => createRef<Txt>());
  const addBtn = createRef<Rect>();
  const field = createRef<Rect>();
  const typed = createRef<Txt>();
  const cards = [createRef<Rect>(), createRef<Rect>()];
  const meta = [createRef<Txt>(), createRef<Txt>()];
  const data = [
    { n: 1, t: 'Фикс редиректа' },
    { n: 2, t: 'Обновить README' },
  ];

  view.add(
    <Win ref={win} w={1500} h={800} y={-30} url="localhost:3100/b/1" opacity={0}>
      <Rect y={-400 + 48 + 28}>
        <AppHeader w={1500} />
      </Rect>
      <TL text="← boards" x={-720} y={-270} fontSize={22} fill={C.muted} />
      <TL text="# Задачи" x={-590} y={-270} fontSize={22} />
      {COLS.map((c, i) => (
        <Rect x={colX(i)} y={45} width={340} height={560} stroke={C.border} lineWidth={2}>
          <Rect y={-280 + 24} width={340} height={48} stroke={C.border} lineWidth={2}>
            <TL ref={heads[i]} text={`## ${c} (0)`} x={-154} fontSize={21} />
          </Rect>
        </Rect>
      ))}
      <Btn ref={addBtn} label="+ task" x={colX(0) - 100} y={45 + 246} w={110} height={40} />
      <Field ref={field} textRef={typed} w={316} y={45 + 246} opacity={0} stroke={C.accent} fontSize={20} />
      {data.map((d, i) => (
        <Rect ref={cards[i]} x={slot(0, i)[0]} y={slot(0, i)[1]} width={316} height={92} fill={C.elev} stroke={C.border} lineWidth={2} opacity={0} shadowColor="#33ff9900" shadowBlur={0}>
          <TL text={`#${d.n}`} x={-146} y={-16} fontSize={22} fill={C.muted} />
          <TL text={d.t} x={-100} y={-16} fontSize={21} />
          <TL ref={meta[i]} text="→ не назначена" x={-146} y={24} fontSize={17} fill={C.muted} />
        </Rect>
      ))}
    </Win>,
  );
  view.add(<Caption ref={cap} n="03" title="Канбан" sub="колонки — этапы; задачи перетаскиваются между ними" />);
  view.add(cur.node);

  const counts = [0, 0, 0, 0];
  const setCount = (c: number, n: number) => {
    counts[c] = n;
    heads[c]().text(`## ${COLS[c]} (${n})`);
  };

  cur.ref().position([700, 280]);
  yield* all(win().opacity(1, 0.5), showCaption(cap));
  yield* cur.ref().opacity(1, 0.3);
  mark('voice:kanban');

  // добавляем две задачи в «Новые»
  for (let i = 0; i < 2; i++) {
    yield* moveCursor(cur.ref, ...S(colX(0) - 100, 45 + 246), 0.7);
    yield* click(cur.ref);
    yield* all(addBtn().opacity(0, 0.1), field().opacity(1, 0.12));
    yield* typeText(typed, data[i]!.t, 0.7);
    yield* waitFor(0.2);
    typed().text('');
    mark('pop');
    cards[i]!().scale(0.92);
    yield* all(field().opacity(0, 0.12), cards[i]!().opacity(1, 0.3), cards[i]!().scale(1, 0.3));
    setCount(0, i + 1);
    yield* addBtn().opacity(1, 0.2);
  }
  yield* waitFor(0.3);

  // перетаскиваем #1 в «В работе»
  const [cx, cy] = slot(0, 0);
  const [tx, ty] = slot(1, 0);
  yield* moveCursor(cur.ref, ...S(cx + 60, cy), 0.7);
  mark('lift', undefined, 0.05);
  yield* all(
    click(cur.ref),
    cards[0]!().stroke(C.accent, 0.15),
    cards[0]!().scale(1.05, 0.15),
    cards[0]!().shadowColor('#33ff99aa', 0.15),
    cards[0]!().shadowBlur(28, 0.15),
  );
  cards[0]!().zIndex(50);
  yield* all(
    cur.ref().position(S(tx + 60, ty), 0.9, easeInOutCubic),
    cards[0]!().position([tx, ty], 0.9, easeInOutCubic),
    cards[0]!().rotation(3, 0.45).back(0.45),
  );
  mark('drop');
  yield* all(
    cards[0]!().scale(1, 0.15),
    cards[0]!().stroke(C.border, 0.2),
    cards[0]!().shadowBlur(0, 0.2),
    cards[1]!().position(slot(0, 0), 0.4, easeInOutCubic),
  );
  setCount(0, 1);
  setCount(1, 1);
  yield* waitFor(0.4);

  yield* waitFor(0.6);
  yield* view.opacity(0, 0.4);
  void meta;
  void Circle;
});

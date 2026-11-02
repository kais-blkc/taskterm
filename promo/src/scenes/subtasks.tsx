import { makeScene2D, Rect, Txt } from '@motion-canvas/2d';
import { all, createRef, easeOutCubic, sequence, waitFor } from '@motion-canvas/core';
import { Btn, BoardBackdrop, C, Caption, createCursor, MiniCard, click, moveCursor, showCaption, slot, T, TL, Win, mark, typeText } from '../ui';

const M = (x: number, y: number): [number, number] => [x, y - 20];
const rowY = (i: number) => -170 + i * 44;
const items = ['Воспроизвести баг', 'Найти причину', 'Написать тест', 'Выкатить фикс'];

export default makeScene2D(function* (view) {
  view.fill(C.bg);
  const cap = createRef<Rect>();
  const win = createRef<Rect>();
  const modal = createRef<Rect>();
  const cur = createCursor();

  const progress = createRef<Txt>();
  const empty = createRef<Txt>();
  const inputRow = createRef<Rect>();
  const listBtn = createRef<Rect>();
  const area = createRef<Rect>();
  const areaTxt = createRef<Txt>();
  const preview = createRef<Txt>();
  const addAll = createRef<Rect>();
  const cancel = createRef<Rect>();
  const rows = items.map(() => createRef<Rect>());
  const boxes = items.map(() => createRef<Rect>());
  const checks = items.map(() => createRef<Txt>());
  const labels = items.map(() => createRef<Txt>());
  const cField = createRef<Rect>();
  const cTxt = createRef<Txt>();
  const cSend = createRef<Rect>();
  const comment = createRef<Rect>();

  view.add(
    <Win ref={win} w={1500} h={800} y={-30} url="localhost:3100/b/1/t/1" opacity={0}>
      <BoardBackdrop counts={[1, 1, 0, 0]} />
      <MiniCard x={slot(1, 0)[0]} y={slot(1, 0)[1]} num={1} title="Фикс редиректа" meta="→ @bob" metaColor={C.bob} />
      <Rect size={[1500, 800]} fill="#000000" opacity={0.72} />
      <Rect ref={modal} y={10} width={1100} height={720} fill={C.elev} stroke={C.accent} lineWidth={2} opacity={0} shadowColor="#000000" shadowBlur={60}>
        <TL text="#1 · В работе" x={-500} y={-325} fontSize={20} fill={C.muted} />
        <TL text="Фикс редиректа" x={-500} y={-285} fontSize={38} fontWeight={700} />

        <TL text="## subtasks" x={-500} y={-215} fontSize={24} />
        <Txt ref={progress} fontFamily="JetBrains Mono" fontSize={22} fill={C.muted} text="" x={500} y={-215} offset={[1, 0]} />
        <TL ref={empty} text="// подзадач нет" x={-500} y={-170} fontSize={22} fill={C.muted} />

        {items.map((t, i) => (
          <Rect ref={rows[i]} y={rowY(i)} opacity={0}>
            <Rect ref={boxes[i]} x={-488} width={24} height={24} stroke={C.muted} lineWidth={2}>
              <T ref={checks[i]} text="" fontSize={20} fill={C.bg} />
            </Rect>
            <TL ref={labels[i]} text={t} x={-460} fontSize={24} />
          </Rect>
        ))}

        <Rect ref={inputRow} y={-110}>
          <Rect x={-120} width={780} height={46} fill={C.bg} stroke={C.border} lineWidth={2}>
            <TL text="+ новая подзадача, enter (можно вставить целый список)" x={-366} fontSize={19} fill={C.muted} />
          </Rect>
          <Btn label="add" x={350} w={80} height={46} />
          <Btn ref={listBtn} label="списком" x={452} w={120} height={46} />
        </Rect>

        <Rect ref={area} y={-60} width={1020} height={190} fill={C.bg} stroke={C.accent} lineWidth={2} opacity={0}>
          <TL ref={areaTxt} text="" x={-490} y={-76} fontSize={22} lineHeight={36} offset={[-1, -1]} />
        </Rect>
        <Btn ref={addAll} label="add 4" primary x={-450} y={75} w={110} height={40} opacity={0} />
        <Btn ref={cancel} label="cancel" x={-340} y={75} w={110} height={40} opacity={0} />
        <TL ref={preview} text="" x={-270} y={75} fontSize={20} fill={C.muted} />

        <TL text="## comments" x={-500} y={140} fontSize={24} />
        <Rect ref={comment} y={210} width={1020} height={74} fill={C.bg} stroke={C.border} lineWidth={2} opacity={0}>
          <Rect x={-508} width={6} height={74} fill={C.alex} />
          <TL text="@alex" x={-490} y={-17} fontSize={19} fill={C.alex} />
          <TL text="· только что" x={-420} y={-17} fontSize={19} fill={C.muted} />
          <TL text="Нашёл причину: кука не успевает записаться" x={-490} y={17} fontSize={22} />
        </Rect>
        <Rect ref={cField} x={-60} y={210} width={900} height={54} fill={C.bg} stroke={C.border} lineWidth={2}>
          <TL ref={cTxt} text="" x={-435} fontSize={22} />
        </Rect>
        <Btn ref={cSend} label="send" primary x={470} y={210} w={100} height={54} />
      </Rect>
    </Win>,
  );
  view.add(<Caption ref={cap} n="05" title="Подзадачи и комментарии" sub="список можно вставить текстом — приложение само его разберёт" />);
  view.add(cur.node);

  const bar = (done: number) => `${'█'.repeat(Math.round((done / 4) * 10))}${'░'.repeat(10 - Math.round((done / 4) * 10))} ${done}/4`;

  cur.ref().position([700, 300]);
  modal().scale(0.96);
  yield* all(win().opacity(1, 0.4), showCaption(cap), modal().opacity(1, 0.4), modal().scale(1, 0.4, easeOutCubic));
  yield* cur.ref().opacity(1, 0.3);
  mark('voice:sub1');

  // «списком» → вставляем текст
  yield* moveCursor(cur.ref, ...M(452, -110), 0.8);
  yield* click(cur.ref);
  yield* all(inputRow().opacity(0, 0.15), empty().opacity(0, 0.15), area().opacity(1, 0.2), addAll().opacity(1, 0.2), cancel().opacity(1, 0.2));
  yield* typeText(areaTxt, '- Воспроизвести баг\n- [x] Найти причину\n- Написать тест\n- Выкатить фикс', 2.2);
  yield* typeText(preview, 'распознано: 4, отмечено: 1', 0.5);
  yield* waitFor(0.6);

  // добавляем
  yield* moveCursor(cur.ref, ...M(-450, 75), 0.7);
  yield* all(click(cur.ref), addAll().fill(C.accent, 0.12));
  mark('ok');
  yield* all(area().opacity(0, 0.2), addAll().opacity(0, 0.2), cancel().opacity(0, 0.2), preview().opacity(0, 0.2));
  inputRow().y(20);
  progress().text(bar(1));
  checks[1]().text('✓');
  boxes[1]().fill(C.accent);
  boxes[1]().stroke(C.accent);
  labels[1]().fill(C.muted);
  for (let i = 0; i < 4; i++) mark('pop', undefined, 0.12 * i);
  yield* all(sequence(0.12, ...rows.map((r) => r().opacity(1, 0.3))), inputRow().opacity(1, 0.4));
  yield* waitFor(0.5);

  // отмечаем ещё одну
  yield* moveCursor(cur.ref, ...M(-488, rowY(0)), 0.7);
  yield* click(cur.ref);
  mark('check');
  checks[0]().text('✓');
  boxes[0]().fill(C.accent);
  boxes[0]().stroke(C.accent);
  labels[0]().fill(C.muted);
  yield* typeText(progress, bar(2), 0.1);
  yield* waitFor(0.5);

  // комментарий
  mark('voice:sub2');
  yield* moveCursor(cur.ref, ...M(-100, 210), 0.8);
  yield* all(click(cur.ref), cField().stroke(C.accent, 0.1));
  yield* typeText(cTxt, 'Нашёл причину: кука не успевает записаться', 1.4);
  yield* moveCursor(cur.ref, ...M(470, 210), 0.6);
  yield* all(click(cur.ref), cSend().fill(C.accent, 0.12));
  mark('send');
  yield* all(cField().opacity(0, 0.1), cSend().opacity(0, 0.1), comment().opacity(1, 0.3));
  yield* waitFor(1.4);
  yield* view.opacity(0, 0.4);
});

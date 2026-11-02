import { makeScene2D, Rect, Txt } from '@motion-canvas/2d';
import { all, createRef, easeOutCubic, waitFor } from '@motion-canvas/core';
import { Btn, BoardBackdrop, C, Caption, createCursor, Field, MiniCard, click, moveCursor, showCaption, slot, T, TL, Win, mark, typeText } from '../ui';

const M = (x: number, y: number): [number, number] => [x, y - 20]; // координаты модалки → сцены

export default makeScene2D(function* (view) {
  view.fill(C.bg);
  const cap = createRef<Rect>();
  const win = createRef<Rect>();
  const modal = createRef<Rect>();
  const dim = createRef<Rect>();
  const card = createRef<Rect>();
  const cur = createCursor();

  const selBox = createRef<Rect>();
  const selTxt = createRef<Txt>();
  const dot = createRef<Rect>();
  const menu = createRef<Rect>();
  const opts = [createRef<Rect>(), createRef<Rect>(), createRef<Rect>(), createRef<Rect>()];
  const dateTxt = createRef<Txt>();
  const dueLbl = createRef<Txt>();
  const dueBtn = createRef<Rect>();
  const tomorrow = createRef<Rect>();
  const clearBtn = createRef<Rect>();
  const editBtn = createRef<Rect>();
  const editor = createRef<Rect>();
  const edTxt = createRef<Txt>();
  const saveBtn = createRef<Rect>();
  const body = createRef<Txt>();
  const empty = createRef<Txt>();
  const metaAssignee = createRef<Txt>();

  const users = [
    { name: '— не назначен —', color: C.muted },
    { name: '@alex (я)', color: C.alex },
    { name: '@bob', color: C.bob },
    { name: '@dana', color: C.dana },
  ];

  view.add(
    <Win ref={win} w={1500} h={800} y={-30} url="localhost:3100/b/1/t/1" opacity={0}>
      <BoardBackdrop counts={[1, 1, 0, 0]} />
      <MiniCard ref={card} x={slot(1, 0)[0]} y={slot(1, 0)[1]} num={1} title="Фикс редиректа" meta="→ не назначена" />
      <MiniCard x={slot(0, 0)[0]} y={slot(0, 0)[1]} num={2} title="Обновить README" meta="→ не назначена" />
      <Rect ref={dim} size={[1500, 800]} fill="#000000" opacity={0} />

      <Rect ref={modal} y={10} width={1100} height={720} fill={C.elev} stroke={C.accent} lineWidth={2} opacity={0} scale={0.94} shadowColor="#000000" shadowBlur={60}>
        <TL text="#1 · В работе" x={-500} y={-325} fontSize={20} fill={C.muted} />
        <TL text="Фикс редиректа" x={-500} y={-285} fontSize={38} fontWeight={700} />
        <Btn label="close esc" danger x={455} y={-318} w={150} height={36} />

        <Rect x={0} y={-80} width={1040} height={190} stroke={C.border} lineWidth={2} fill={C.bg}>
          <TL text="создал" x={-480} y={-60} fontSize={22} fill={C.muted} />
          <TL text="@alex" x={-330} y={-60} fontSize={22} fill={C.alex} />
          <TL text="31 окт 2026" x={-250} y={-60} fontSize={22} fill={C.muted} />
          <TL text="ответственный" x={-480} y={-5} fontSize={22} fill={C.muted} />
          <TL text="дедлайн" x={-480} y={55} fontSize={22} fill={C.muted} />
        </Rect>

        {/* выбор ответственного */}
        <Rect ref={selBox} x={-130} y={-85} width={300} height={40} fill={C.bg} stroke={C.border} lineWidth={2}>
          <Rect ref={dot} x={-128} width={14} height={14} fill={C.muted} />
          <TL ref={selTxt} text="— не назначен —" x={-108} fontSize={21} fill={C.muted} />
          <T text="▾" x={128} fontSize={21} fill={C.muted} />
        </Rect>
        <Btn ref={clearBtn} label="взять себе" x={135} y={-85} w={170} height={40} />

        {/* дедлайн */}
        <Rect x={-170} y={-25} width={220} height={40} fill={C.bg} stroke={C.border} lineWidth={2}>
          <TL ref={dateTxt} text="дд.мм.гггг" x={-95} fontSize={21} fill={C.muted} />
        </Rect>
        <Btn label="сегодня" x={15} y={-25} w={110} height={40} />
        <Btn ref={tomorrow} label="завтра" x={135} y={-25} w={100} height={40} />
        <Btn label="+7 дней" x={250} y={-25} w={110} height={40} />
        <Btn ref={dueBtn} label="убрать" danger x={363} y={-25} w={96} height={40} opacity={0} />
        <TL ref={dueLbl} text="" x={425} y={-25} fontSize={19} fill={C.accent} />

        {/* описание */}
        <TL text="## description" x={-500} y={65} fontSize={24} />
        <Btn ref={editBtn} label="edit" x={445} y={65} w={80} height={36} />
        <TL ref={empty} text="// описания нет" x={-500} y={115} fontSize={22} fill={C.muted} />
        <TL ref={body} text="" x={-500} y={135} fontSize={22} lineHeight={34} offset={[-1, -1]} />
        <Rect ref={editor} y={200} width={1020} height={200} fill={C.bg} stroke={C.accent} lineWidth={2} opacity={0}>
          <TL ref={edTxt} text="" x={-490} y={-80} fontSize={22} lineHeight={34} offset={[-1, -1]} />
        </Rect>
        <Btn ref={saveBtn} label="save" primary x={-460} y={330} w={100} height={40} opacity={0} />

        {/* выпадающий список ответственных поверх всего */}
        <Rect ref={menu} x={-130} y={-85 + 24 + 108} width={300} height={216} fill={C.elev} stroke={C.accent} lineWidth={2} opacity={0} zIndex={10}>
          {users.map((u, i) => (
            <Rect ref={opts[i]} y={-81 + i * 54} width={296} height={50}>
              <Rect x={-128} width={14} height={14} fill={u.color} />
              <TL text={u.name} x={-108} fontSize={21} fill={i === 0 ? C.muted : C.fg} />
            </Rect>
          ))}
        </Rect>
      </Rect>
    </Win>,
  );
  view.add(<Caption ref={cap} n="04" title="Задача" sub="исполнитель, дедлайн, описание в markdown" />);
  view.add(cur.node);
  void metaAssignee;

  cur.ref().position([700, 300]);
  yield* all(win().opacity(1, 0.5), showCaption(cap));
  yield* cur.ref().opacity(1, 0.3);

  // клик по карточке → открывается модалка
  yield* moveCursor(cur.ref, slot(1, 0)[0] + 40, slot(1, 0)[1] - 30, 0.8);
  yield* all(click(cur.ref), card().stroke(C.accent, 0.12));
  mark('whoosh');
  yield* all(dim().opacity(0.72, 0.35), modal().opacity(1, 0.35), modal().scale(1, 0.35, easeOutCubic));
  yield* waitFor(0.3);

  // ответственный
  mark('voice:task1');
  yield* moveCursor(cur.ref, ...M(-130, -85), 0.7);
  yield* click(cur.ref);
  mark('pop');
  yield* menu().opacity(1, 0.15);
  yield* moveCursor(cur.ref, ...M(-130, -85 + 24 + 108 - 81 + 2 * 54), 0.5);
  yield* opts[2]!().fill(C.accent, 0.1);
  yield* waitFor(0.2);
  yield* click(cur.ref);
  mark('tick');
  yield* all(menu().opacity(0, 0.12));
  selTxt().text('@bob');
  selTxt().fill(C.bob);
  dot().fill(C.bob);
  yield* selBox().stroke(C.bob, 0.15);
  yield* waitFor(0.3);

  // дедлайн
  yield* waitFor(0.7);
  mark('voice:task2');
  yield* moveCursor(cur.ref, ...M(135, -25), 0.7);
  yield* all(click(cur.ref), tomorrow().stroke(C.accent, 0.1));
  dateTxt().text('02.11.2026');
  dateTxt().fill(C.fg);
  dueLbl().text('⏱ завтра');
  mark('pop');
  yield* all(dueBtn().opacity(1, 0.25), dueLbl().opacity(1, 0.25));
  yield* waitFor(0.4);

  // описание
  yield* waitFor(2.3);
  mark('voice:task3');
  yield* moveCursor(cur.ref, ...M(445, 65), 0.7);
  yield* all(click(cur.ref), editBtn().opacity(0, 0.1));
  yield* all(empty().opacity(0, 0.1), editor().opacity(1, 0.2), saveBtn().opacity(1, 0.2));
  yield* typeText(edTxt, 'После логина редирект ведёт на /404.\nШаги: открыть /login, ввести данные,\nнажать login. Ожидаем: главная страница.', 2.2);
  yield* moveCursor(cur.ref, ...M(-410, 330), 0.6);
  yield* all(click(cur.ref), saveBtn().fill(C.accent, 0.12));
  mark('ok');
  body().text(edTxt().text());
  yield* all(editor().opacity(0, 0.2), saveBtn().opacity(0, 0.2));
  yield* waitFor(1.2);
  yield* view.opacity(0, 0.4);
});

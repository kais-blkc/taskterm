import { makeScene2D, Node, Rect, Txt } from '@motion-canvas/2d';
import { all, createRef, waitFor } from '@motion-canvas/core';
import { BoardBackdrop, C, Caption, MiniCard, showCaption, slot, T, TL, Win, mark, typeText } from '../ui';

export default makeScene2D(function* (view) {
  view.fill(C.bg);
  const cap = createRef<Rect>();
  const win = createRef<Rect>();
  const sel = createRef<Rect>();
  const keycap = createRef<Rect>();
  const keyTxt = createRef<Txt>();
  const keyDesc = createRef<Txt>();
  const modal = createRef<Rect>();
  const palette = createRef<Rect>();
  const palTxt = createRef<Txt>();
  const palHi = createRef<Rect>();
  const help = createRef<Rect>();

  const cardPos = { a: slot(0, 0), b: slot(0, 1), c: slot(1, 0) };

  view.add(
    <Win ref={win} w={1500} h={800} y={-30} url="localhost:3100/b/1" opacity={0}>
      <BoardBackdrop counts={[2, 1, 0, 0]} />
      <MiniCard x={cardPos.a[0]} y={cardPos.a[1]} num={2} title="Обновить README" meta="→ не назначена" />
      <MiniCard x={cardPos.b[0]} y={cardPos.b[1]} num={3} title="Тесты на auth" meta="→ не назначена" />
      <MiniCard x={cardPos.c[0]} y={cardPos.c[1]} num={1} title="Фикс редиректа" meta="→ @bob" metaColor={C.bob} />
      <Rect ref={sel} width={328} height={104} stroke={C.accent} lineWidth={4} opacity={0} x={cardPos.a[0]} y={cardPos.a[1]} />

      <Rect ref={modal} width={760} height={380} y={10} fill={C.elev} stroke={C.accent} lineWidth={2} opacity={0} zIndex={8} shadowColor="#000000" shadowBlur={50}>
        <TL text="#1 · В работе" x={-340} y={-130} fontSize={20} fill={C.muted} />
        <TL text="Фикс редиректа" x={-340} y={-85} fontSize={38} fontWeight={700} />
        <TL text="ответственный  @bob      дедлайн  ⏱ завтра" x={-340} y={-20} fontSize={22} fill={C.muted} />
      </Rect>

      <Rect ref={palette} width={760} height={350} y={-50} fill={C.elev} stroke={C.accent} lineWidth={2} opacity={0} zIndex={9} shadowColor="#000000" shadowBlur={60}>
        <Rect y={-152} width={760} height={46} stroke={C.border} lineWidth={2}>
          <T text=">" x={-350} fontSize={24} fill={C.muted} />
          <TL ref={palTxt} text="" x={-325} fontSize={24} />
        </Rect>
        <TL text="## boards" x={-350} y={-110} fontSize={16} fill={C.muted} />
        <Rect ref={palHi} y={-76} width={756} height={38} fill={C.accent} opacity={0} />
        <TL text="board: Баги" x={-350} y={-76} fontSize={22} fill={C.bg} />
        <TL text="## tasks" x={-350} y={-40} fontSize={16} fill={C.muted} />
        <TL text="#7 Баг: кука при логине" x={-350} y={-12} fontSize={22} />
        <TL text="#9 Баг в фильтре досок" x={-350} y={28} fontSize={22} />
        <TL text="## actions" x={-350} y={64} fontSize={16} fill={C.muted} />
        <TL text="горячие клавиши" x={-350} y={96} fontSize={22} />
        <T text="?" x={340} y={96} fontSize={20} fill={C.muted} />
      </Rect>

      <Rect ref={help} width={620} height={350} y={10} fill={C.elev} stroke={C.accent} lineWidth={2} opacity={0} zIndex={9}>
        <TL text="$ taskterm --help" x={-280} y={-145} fontSize={24} />
        {[['h j k l', 'выбор карточки'], ['Enter', 'открыть задачу'], ['n', 'новая задача'], ['Ctrl+K', 'палитра'], ['Esc', 'закрыть']].map(([k, d], i) => (
          <Node y={-85 + i * 52}>
            <Rect x={-210} width={150} height={36} stroke={C.border} lineWidth={2}>
              <T text={k!} fontSize={20} fill={C.accent} />
            </Rect>
            <TL text={d!} x={-110} fontSize={22} />
          </Node>
        ))}
      </Rect>

      <Rect ref={keycap} y={325} x={-120} opacity={0} layout alignItems="center" gap={20}>
        <Rect padding={[8, 22]} stroke={C.accent} lineWidth={3} fill={C.bg} radius={6}>
          <T ref={keyTxt} text="j" fontSize={34} fill={C.accent} fontWeight={700} />
        </Rect>
        <T ref={keyDesc} text="" fontSize={26} fill={C.muted} />
      </Rect>
    </Win>,
  );
  view.add(<Caption ref={cap} n="08" title="Горячие клавиши" sub="вся работа с клавиатуры: hjkl, Enter, n, Ctrl+K, ?" />);

  const press = function* (label: string, desc: string) {
    mark('keypress');
    keyTxt().text(label);
    keyDesc().text(desc);
    keycap().opacity(1);
    yield* keycap().scale(1.12, 0.07);
    yield* keycap().scale(1, 0.1);
  };
  const moveSel = (p: [number, number]) => {
    mark('tick');
    return sel().position(p, 0.18);
  };

  yield* all(win().opacity(1, 0.5), showCaption(cap));
  yield* waitFor(0.3);

  mark('voice:hot1');
  yield* press('j', 'выбрать карточку');
  sel().position(cardPos.a);
  yield* sel().opacity(1, 0.15);
  yield* waitFor(0.5);
  yield* press('j', 'вниз');
  yield* moveSel(cardPos.b);
  yield* waitFor(0.5);
  yield* press('k', 'вверх');
  yield* moveSel(cardPos.a);
  yield* waitFor(0.5);
  yield* press('l', 'в соседнюю колонку');
  yield* moveSel(cardPos.c);
  yield* waitFor(0.5);

  yield* press('Enter', 'открыть задачу');
  mark('whoosh');
  yield* modal().opacity(1, 0.25);
  yield* waitFor(0.8);
  yield* press('Esc', 'закрыть');
  mark('whoosh');
  yield* modal().opacity(0, 0.2);
  yield* sel().opacity(0, 0.2);
  yield* waitFor(0.3);

  mark('voice:hot2');
  yield* press('Ctrl+K', 'командная палитра');
  palHi().opacity(1);
  mark('pop');
  yield* palette().opacity(1, 0.25);
  yield* typeText(palTxt, 'баг', 0.5);
  yield* waitFor(3.2);
  yield* press('Esc', 'закрыть');
  yield* palette().opacity(0, 0.2);
  yield* waitFor(0.2);

  mark('voice:hot3');
  yield* press('?', 'подсказка по клавишам');
  mark('pop');
  yield* help().opacity(1, 0.25);
  yield* waitFor(2.6);
  yield* help().opacity(0, 0.2);
  yield* view.opacity(0, 0.4);
});

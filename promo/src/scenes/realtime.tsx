import { makeScene2D, Rect, RectProps, Txt } from '@motion-canvas/2d';
import { all, createRef, easeOutCubic, waitFor } from '@motion-canvas/core';
import { Btn, C, Caption, createCursor, click, moveCursor, showCaption, T, TL, Win, mark, typeText } from '../ui';

const WX = 480;

function Thread({ user, color }: { user: string; color: string }) {
  return (
    <>
      <TL text="$ taskterm" x={-420} y={-250} fontSize={20} />
      <TL text={`@${user}`} x={330} y={-250} fontSize={20} fill={color} />
      <TL text="#1 Фикс редиректа" x={-420} y={-195} fontSize={32} fontWeight={700} />
      <TL text="## comments" x={-420} y={-130} fontSize={22} />
    </>
  );
}

function Msg({ who, color, text, ...rest }: RectProps & { who: string; color: string; text: string }) {
  return (
    <Rect width={840} height={78} fill={C.bg} stroke={C.border} lineWidth={2} {...rest}>
      <Rect x={-417} width={6} height={78} fill={color} />
      <TL text={`@${who}`} x={-395} y={-18} fontSize={19} fill={color} />
      <TL text={text} x={-395} y={18} fontSize={23} />
    </Rect>
  );
}

export default makeScene2D(function* (view) {
  view.fill(C.bg);
  const cap = createRef<Rect>();
  const left = createRef<Rect>();
  const right = createRef<Rect>();
  const cur = createCursor();
  const field = createRef<Rect>();
  const typed = createRef<Txt>();
  const send = createRef<Rect>();
  const mine = createRef<Rect>();
  const theirs = createRef<Rect>();
  const toast = createRef<Rect>();

  view.add(
    <>
      <Win ref={left} w={900} h={640} x={-WX} y={-45} url="alex · localhost:3100" opacity={0}>
        <Thread user="alex" color={C.alex} />
        <Msg ref={mine} who="alex" color={C.alex} text="Проверил — воспроизводится" y={-30} opacity={0} />
        <Rect ref={field} y={70} width={700} height={52} x={-70} fill={C.bg} stroke={C.border} lineWidth={2}>
          <TL ref={typed} text="" x={-335} fontSize={22} />
        </Rect>
        <Btn ref={send} label="send" primary x={370} y={70} w={96} height={52} />
      </Win>
      <Win ref={right} w={900} h={640} x={WX} y={-45} url="bob · localhost:3100" opacity={0}>
        <Thread user="bob" color={C.bob} />
        <Msg ref={theirs} who="alex" color={C.alex} text="Проверил — воспроизводится" y={-30} opacity={0} />
        <Rect ref={toast} x={215} y={-215} width={470} height={96} fill={C.elev} stroke={C.accent} lineWidth={2} opacity={0} zIndex={20} shadowColor="#33ff9955" shadowBlur={30}>
          <TL text="#1 Фикс редиректа" x={-215} y={-20} fontSize={22} fontWeight={700} />
          <TL text="@alex: Проверил — воспроизводится" x={-215} y={20} fontSize={19} fill={C.muted} />
        </Rect>
      </Win>
    </>,
  );
  view.add(<Caption ref={cap} n="06" title="Живые обновления" sub="комментарии видны сразу всем, плюс уведомления в браузере" />);
  view.add(cur.node);

  cur.ref().position([300, 300]);
  yield* all(left().opacity(1, 0.5), right().opacity(1, 0.5), showCaption(cap));
  yield* cur.ref().opacity(1, 0.3);
  mark('voice:rt1');

  yield* moveCursor(cur.ref, -WX - 70, -45 + 70, 0.9);
  yield* all(click(cur.ref), field().stroke(C.accent, 0.1));
  yield* typeText(typed, 'Проверил — воспроизводится', 1.2);
  yield* moveCursor(cur.ref, -WX + 370, -45 + 70, 0.6);
  yield* all(click(cur.ref), send().fill(C.accent, 0.12));
  mark('send');
  typed().text('');
  yield* all(field().stroke(C.border, 0.1), send().fill('#00000000', 0.1), mine().opacity(1, 0.3));
  yield* waitFor(0.35);

  // у bob всё появляется само
  theirs().x(60);
  mark('pop');
  yield* all(theirs().opacity(1, 0.4), theirs().x(0, 0.4, easeOutCubic));
  mark('ping');
  mark('voice:rt2', undefined, 0.6);
  toast().y(-275);
  yield* all(toast().opacity(1, 0.35), toast().y(-215, 0.4, easeOutCubic), toast().scale(1, 0.4));
  yield* waitFor(3.1);
  yield* all(toast().opacity(0, 0.4));
  yield* view.opacity(0, 0.4);
  void T;
});

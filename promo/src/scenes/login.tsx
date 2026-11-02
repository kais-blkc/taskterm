import { makeScene2D, Rect, Txt } from '@motion-canvas/2d';
import { all, createRef, waitFor } from '@motion-canvas/core';
import { AppHeader, Btn, C, Caption, createCursor, Field, click, moveCursor, showCaption, T, TL, Win, mark, typeText } from '../ui';

export default makeScene2D(function* (view) {
  view.fill(C.bg);
  const cap = createRef<Rect>();
  const form = createRef<Rect>();
  const user = createRef<Txt>();
  const pass = createRef<Txt>();
  const key = createRef<Txt>();
  const f1 = createRef<Rect>();
  const f2 = createRef<Rect>();
  const f3 = createRef<Rect>();
  const btn = createRef<Rect>();
  const ok = createRef<Rect>();
  const win = createRef<Rect>();
  const cur = createCursor();

  view.add(
    <Win ref={win} w={1500} h={800} y={-30} url="localhost:3100" opacity={0}>
      <Rect ref={form} y={30}>
        <TL text="$ taskterm" x={-260} y={-250} fontSize={52} fontWeight={700} />
        <Btn label="login" x={-260 + 52} y={-175} w={104} height={40} stroke={C.accent} />
        <Btn label="register" x={-260 + 52 + 130} y={-175} w={140} height={40} />
        <TL text="username:" x={-260} y={-112} fontSize={22} fill={C.muted} />
        <Field ref={f1} textRef={user} w={520} y={-62} />
        <TL text="password:" x={-260} y={-8} fontSize={22} fill={C.muted} />
        <Field ref={f2} textRef={pass} w={520} y={42} />
        <TL text="access key:" x={-260} y={96} fontSize={22} fill={C.muted} />
        <Field ref={f3} textRef={key} w={520} y={146} />
        <Btn ref={btn} label="> login" primary x={-260 + 75} y={236} w={150} height={46} />
      </Rect>
      <Rect ref={ok} opacity={0} y={20}>
        <T text="✓ вход выполнен" fontSize={52} fill={C.accent} y={-30} />
        <T text="добро пожаловать, @alex" fontSize={32} fill={C.muted} y={40} />
      </Rect>
    </Win>,
  );
  view.add(<Caption ref={cap} n="01" title="Вход" sub="логин, пароль и общий ключ доступа команды" />);
  view.add(cur.node);

  // координаты курсора — в системе сцены (окно смещено на y=-30, форма на +30)
  const at = (x: number, y: number): [number, number] => [x, y - 30 + 30];

  cur.ref().position([700, 300]);
  yield* all(win().opacity(1, 0.5), showCaption(cap));
  yield* cur.ref().opacity(1, 0.3);
  mark('voice:login');

  yield* moveCursor(cur.ref, ...at(-60, -62));
  yield* click(cur.ref);
  yield* f1().stroke(C.accent, 0.1);
  yield* typeText(user, 'alex', 0.5);
  yield* f1().stroke(C.border, 0.1);

  yield* moveCursor(cur.ref, ...at(-60, 42), 0.5);
  yield* click(cur.ref);
  yield* f2().stroke(C.accent, 0.1);
  yield* typeText(pass, '••••••••', 0.6);
  yield* f2().stroke(C.border, 0.1);

  yield* moveCursor(cur.ref, ...at(-60, 146), 0.5);
  yield* click(cur.ref);
  yield* f3().stroke(C.accent, 0.1);
  yield* typeText(key, '••••••••••', 0.7);
  yield* f3().stroke(C.border, 0.1);

  yield* moveCursor(cur.ref, ...at(-185, 236), 0.6);
  yield* all(btn().fill(C.accent, 0.15), click(cur.ref));
  yield* waitFor(0.2);
  mark('chime');
  yield* all(form().opacity(0, 0.35), ok().opacity(1, 0.5));
  yield* waitFor(1.1);
  yield* view.opacity(0, 0.4);
});

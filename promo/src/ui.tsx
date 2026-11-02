import { Circle, Line, Node, Rect, RectProps, Txt, TxtProps } from '@motion-canvas/2d';
import { all, createRef, easeInOutCubic, easeOutCubic, Reference, useScene, useThread, waitFor } from '@motion-canvas/core';

/** Палитра = тема phosphor из самого приложения */
export const C = {
  bg: '#0c0d0d',
  elev: '#151716',
  fg: '#e6e8e7',
  muted: '#8b918e',
  accent: '#33ff99',
  border: '#2a2f2c',
  danger: '#ff5f56',
  alex: '#22d3ee',
  bob: '#f26d61',
  dana: '#e5d84a',
};
export const FONT = 'JetBrains Mono';

/** Текст с шрифтом приложения; любой проп переопределяет значения по умолчанию */
export const T = (p: TxtProps) => <Txt fontFamily={FONT} fill={C.fg} fontSize={28} {...p} />;

/** Левое выравнивание: точка привязки текста — левый край */
export const TL = (p: TxtProps) => <T offset={[-1, 0]} {...p} />;

/** Кнопка в стиле приложения (рамка = «можно нажать») */
export function Btn({
  label,
  primary,
  danger,
  w,
  ...rest
}: RectProps & { label: string; primary?: boolean; danger?: boolean; w?: number }) {
  const color = primary ? C.accent : danger ? C.danger : C.fg;
  return (
    <Rect
      width={w ?? label.length * 17 + 36}
      height={44}
      stroke={primary ? C.accent : danger ? C.danger : C.border}
      lineWidth={2}
      {...rest}
    >
      <T text={label} fontSize={24} fill={color} />
    </Rect>
  );
}

/** Поле ввода: текст можно печатать через ref */
export function Field({
  w,
  placeholder,
  textRef,
  focus,
  ...rest
}: RectProps & { w: number; placeholder?: string; textRef?: Reference<Txt>; focus?: boolean }) {
  return (
    <Rect width={w} height={52} fill={C.bg} stroke={focus ? C.accent : C.border} lineWidth={2} {...rest}>
      {placeholder && <TL text={placeholder} fontSize={22} fill={C.muted} x={-w / 2 + 16} />}
      <TL ref={textRef} text="" fontSize={26} x={-w / 2 + 16} />
    </Rect>
  );
}

/** Курсор мыши */
export function createCursor() {
  const ref = createRef<Node>();
  const node = (
    <Node ref={ref} zIndex={1000} opacity={0}>
      <Line
        points={[
          [0, 0],
          [0, 30],
          [8, 23],
          [14, 36],
          [20, 33],
          [14, 21],
          [24, 21],
        ]}
        closed
        fill="#ffffff"
        stroke="#000000"
        lineWidth={3}
        lineJoin="round"
      />
    </Node>
  );
  return { ref, node };
}

/**
 * Метка для звукового оформления: фиксирует АБСОЛЮТНОЕ время кадра на таймлайне видео.
 * Скрипт рендера забирает window.__promoMarks, по ним строится звуковая дорожка (scripts/audio).
 * kind — тип эффекта (click, pop, whoosh, type, voice:<id> …), v — параметр (напр. длительность печати),
 * dt — сдвиг от текущего момента (для эффектов внутри sequence).
 */
type Mark = { t: number; kind: string; v?: number };
declare global {
  interface Window {
    __promoMarks?: Record<string, Mark>;
  }
}
const markCounters = new WeakMap<object, number>();
export function mark(kind: string, v?: number, dt = 0) {
  const scene = useScene();
  const thread = useThread();
  const t = scene.firstFrame / scene.playback.fps + thread.time() + dt;
  // счётчик общий для всего прогона сцены: идём к корневому потоку (метки из all()/sequence() идут из дочерних)
  let root = thread;
  while (root.parent) root = root.parent;
  const i = markCounters.get(root) ?? 0;
  markCounters.set(root, i + 1);
  // ключ стабилен между прогонами сцены — повторный прогон перезаписывает метки
  (window.__promoMarks ??= {})[`${scene.name}#${String(i).padStart(3, '0')}`] = { t, kind, v };
}

/** Печать текста с метками для звука клавиш */
export function* typeText(ref: Reference<any>, text: string, dur: number) {
  if (dur >= 0.25) mark(`type:${text.length}`, dur);
  yield* ref().text(text, dur);
}

export function* moveCursor(cursor: Reference<Node>, x: number, y: number, t = 0.7) {
  yield* cursor().position([x, y], t, easeInOutCubic);
}

export function* click(cursor: Reference<Node>) {
  mark('click');
  yield* cursor().scale(0.82, 0.07);
  yield* cursor().scale(1, 0.1);
}

/** Подпись шага внизу кадра */
export function Caption({ n, title, sub, ref }: { n: string; title: string; sub?: string; ref: Reference<Rect> }) {
  return (
    <Rect ref={ref} y={478} opacity={0} layout alignItems="center" gap={22} padding={[14, 28]} fill="#0c0d0dee" stroke={C.border} lineWidth={2}>
      <Rect padding={[4, 12]} fill={C.accent}>
        <T text={n} fontSize={26} fill={C.bg} fontWeight={700} />
      </Rect>
      <T text={title} fontSize={30} fontWeight={700} />
      {sub && <T text={sub} fontSize={24} fill={C.muted} />}
    </Rect>
  );
}

export function* showCaption(ref: Reference<Rect>) {
  mark('whoosh');
  ref().y(500);
  yield* all(ref().opacity(1, 0.45), ref().y(478, 0.45, easeOutCubic));
}

/** Рамка окна приложения с «адресной строкой» */
export function Win({ w, h, url, children, ...rest }: RectProps & { w: number; h: number; url: string }) {
  return (
    <Rect size={[w, h]} fill={C.bg} stroke={C.border} lineWidth={2} radius={10} clip {...rest}>
      <Rect y={-h / 2 + 24} width={w} height={48} fill={C.elev}>
        <Circle x={-w / 2 + 28} size={14} fill="#ff5f56" />
        <Circle x={-w / 2 + 52} size={14} fill="#ffbd2e" />
        <Circle x={-w / 2 + 76} size={14} fill="#27c93f" />
        <Rect x={0} width={w * 0.42} height={30} fill={C.bg} radius={6}>
          <T text={url} fontSize={18} fill={C.muted} />
        </Rect>
      </Rect>
      {children}
    </Rect>
  );
}

/** Шапка приложения */
export function AppHeader({ w, user = 'alex', color = C.alex }: { w: number; user?: string; color?: string }) {
  return (
    <Rect width={w} height={56} y={-0} stroke={C.border} lineWidth={2} fill={C.bg}>
      <TL text="$ taskterm" x={-w / 2 + 24} fontSize={24} />
      <Btn label="theme" x={w / 2 - 330} w={96} height={34} />
      <TL text={`@${user}`} x={w / 2 - 210} fontSize={22} fill={color} />
      <Btn label="logout" x={w / 2 - 70} w={104} height={34} />
    </Rect>
  );
}

export { all, waitFor };

export const COLS = ['Новые', 'В работе', 'На проверке', 'Сделано'];
export const colX = (c: number) => -537 + c * 358;
export const slot = (c: number, r: number): [number, number] => [colX(c), -125 + r * 106];

/** Статичные колонки доски (фон для модалок) */
export function BoardBackdrop({ counts }: { counts: number[] }) {
  return (
    <>
      <Rect y={-400 + 48 + 28}>
        <AppHeader w={1500} />
      </Rect>
      {COLS.map((c, i) => (
        <Rect x={colX(i)} y={45} width={340} height={560} stroke={C.border} lineWidth={2}>
          <Rect y={-280 + 24} width={340} height={48} stroke={C.border} lineWidth={2}>
            <TL text={`## ${c} (${counts[i]})`} x={-154} fontSize={21} />
          </Rect>
        </Rect>
      ))}
    </>
  );
}

export function MiniCard({ num, title, meta, metaColor, ...rest }: RectProps & { num: number; title: string; meta: string; metaColor?: string }) {
  return (
    <Rect width={316} height={92} fill={C.elev} stroke={C.border} lineWidth={2} {...rest}>
      <TL text={`#${num}`} x={-146} y={-16} fontSize={22} fill={C.muted} />
      <TL text={title} x={-100} y={-16} fontSize={21} />
      <TL text={meta} x={-146} y={24} fontSize={17} fill={metaColor ?? C.muted} />
    </Rect>
  );
}

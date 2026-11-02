import { makeScene2D, Txt, Rect } from '@motion-canvas/2d';
import { createRef, waitFor } from '@motion-canvas/core';

export default makeScene2D(function* (view) {
  view.fill('#0c0d0d');
  const t = createRef<Txt>();
  view.add(
    <Rect size={[600, 200]} stroke="#33ff99" lineWidth={4}>
      <Txt ref={t} fill="#e6e8e7" fontFamily="monospace" fontSize={48} text="" />
    </Rect>,
  );
  yield* t().text('$ taskterm', 1);
  yield* waitFor(1);
});

/**
 * The brand mark, drawn by Blit itself: the `logo` example is evaluated and
 * played here, so editing that sketch is how the logo is changed.
 */

import { useEffect, useMemo, useRef } from 'react';

import { evaluateSketch } from '../lib/blit/evaluate';
import { renderToRgba } from '../lib/blit/render';
import { findExample } from '../lib/examples';
import { prefersReducedMotion } from '../hooks/useIsMobile';

const SCALE = 2;

export default function BlitLogo() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const sketch = useMemo(() => {
    const logo = findExample('logo');
    return logo ? evaluateSketch(logo.code) : null;
  }, []);
  const { w, h } = sketch?.settings ?? { w: 0, h: 0 };

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!sketch || !ctx) return;
    const { fps, cycle, ramp } = sketch.settings;
    let frame = 0;
    const draw = () => {
      const data = renderToRgba(sketch.pattern, { w, h, frame, fps, cycle, ramp });
      ctx.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
      frame = (frame + 1) % cycle;
    };
    draw();
    if (prefersReducedMotion()) return;
    const timer = setInterval(draw, 1000 / fps);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the logo is fixed for the page's life
  }, []);

  if (!sketch) return null;
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      role="img"
      aria-label="Blit"
      style={{ width: w * SCALE, height: h * SCALE, imageRendering: 'pixelated', flexShrink: 0 }}
    />
  );
}

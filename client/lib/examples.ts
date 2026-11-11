/**
 * The example gallery.
 *
 * In a live-coding environment the examples ARE the documentation: people learn
 * the language by loading one and mutating it, not by reading a reference. So
 * each of these is picked to teach exactly one idea, is short enough to read in
 * full, and is deliberately fun to break.
 *
 * `examples.test.ts` evaluates every one of them, so a rename in the algebra
 * cannot quietly leave a broken example in the gallery.
 */

export interface Example {
  id: string;
  name: string;
  /** The one idea this example exists to teach. */
  teaches: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'ship',
    name: 'Ship',
    teaches: 'A sprite, a palette, and an outline',
    code: `// Characters are the mini-notation. '.' is transparent.
// Click a pixel on the canvas: it edits the character below.
size(16, 16);

out(sprite(\`
  ...ww...
  ..wwww..
  .wwccww.
  .wwwwww.
  wwwwwwww
  w.wwww.w
  ..w..w..
  ..r..r..
\`)
  .pal({ w: '#c0cbdc', c: '#41a6f6', r: '#ef7d57' })
  .outline('#181425')
  .scale(2)
  .center());
`,
  },
  {
    id: 'mirror',
    name: 'Mirror',
    teaches: 'Draw half, get the whole thing',
    code: `// mirror() is symmetry, not reflection: the left half is copied onto the
// right. Draw half a creature and it stays symmetrical while you edit it.
size(16, 16);

out(sprite(\`
  ..nnn...
  .nyyyn..
  .nykyy..
  .nyyyy..
  ..nyyy..
  ..nnyy..
  ...nnn..
  ....n...
\`)
  .pal({ n: '#7a2032', y: '#feae34', k: '#181425' })
  .mirror('x')
  .scale(2)
  .center());
`,
  },
  {
    id: 'walk',
    name: 'Walk cycle',
    teaches: 'frames() and slow() are the animation',
    code: `// One pattern per frame, then slow the clock so each is held.
// Try slow(2), or add a fourth frame.
size(16, 16); fps(12); cycle(8);

out(frames(
  sprite(\`
  ..gggg..
  .gggggg.
  .gkggkg.
  .gggggg.
  ..gggg..
  ..g..g..
  .g....g.
\`),
  sprite(\`
  ..gggg..
  .gggggg.
  .gkggkg.
  .gggggg.
  ..gggg..
  ..gggg..
  ..g..g..
\`),
  sprite(\`
  ..gggg..
  .gggggg.
  .gkggkg.
  .gggggg.
  ..gggg..
  ..g..g..
  ..g..g..
\`),
)
  .pal({ g: '#63c74d', k: '#181425' })
  .slow(3)
  .outline('#181425')
  .scale(2)
  .center());
`,
  },
  {
    id: 'cycling',
    name: 'Palette cycling',
    teaches: 'Digits index a ramp, so shifting it animates for free',
    code: `// Digits 0-9 address the active ramp instead of a fixed color, so
// palShift() rotates the ramp once per cycle and nothing else changes.
// The cheapest animation in the language.
size(16, 16); fps(12); cycle(3);

out(sprite(\`
  ...0000...
  ..011110..
  .01222210.
  0123333210
  0123443210
  0123443210
  0123333210
  .01222210.
  ..011110..
  ...0000...
\`)
  .ramp('ember')
  .palShift(1)
  .center());
`,
  },
  {
    id: 'dither',
    name: 'Dithered ramp',
    teaches: 'Generated fields compose with hand-drawn ones',
    code: `// A gradient is not pixel art. A DITHERED gradient is.
// Same Pattern type as a sprite, so they stack.
size(32, 32); fps(8); cycle(16);

const sky = grad('#1a1c2c', '#f4f4f4', 90).dither('#29366f', '#73eff7');

const moon = circle(4, '#ffcd75').center().shift(6, -6);

out(stack(sky, moon.outline('#1a1c2c')));
`,
  },
  {
    id: 'title',
    name: 'Title card',
    teaches: 'Text is a pattern, so every operator applies to it',
    code: `// text() is a constructor like any other, so the letters outline,
// shadow, centre and animate the same way a sprite does.
// '3x5' is the caps font small enough for a sprite; '5x7' has lowercase.
size(64, 24); fps(12); cycle(16);

out(stack(
  grad('#1a1c2c', '#333c57'),
  text('BLIT', '#ffcd75')
    .outline('#181425')
    .center()
    .shift(0, -5),
  text('press run', { font: '5x7', color: '#94b0c2' })
    .center()
    .shift(0, 5)
    .every(2, (p) => p.tint('#566c86')),
));
`,
  },
  {
    id: 'family',
    name: 'Enemy family',
    teaches: 'Parameterised sprites: the thing a GUI cannot do',
    code: `// One template, three enemies, guaranteed consistent. Change the body
// shape once and every variant follows.
//
// All three share ONE sprite literal, so painting a pixel edits the whole
// family at once. That is the point.
size(48, 16); fps(8);

const slime = (body, eye) => sprite(\`
  ..bbbb..
  .bbbbbb.
  bbeebeeb
  bbbbbbbb
  .bbbbbb.
  ..b..b..
\`).pal({ b: body, e: eye });

const palettes = [
  ['#63c74d', '#181425'],
  ['#e43b44', '#feae34'],
  ['#41a6f6', '#f4f4f4'],
];

out(stack(...palettes.map(([body, eye], i) =>
  slime(body, eye).outline('#181425').shift(i * 16 + 4, 5),
)));
`,
  },
  {
    id: 'euclid',
    name: 'Euclidean lights',
    teaches: 'Strudel time operators, on the frame clock',
    code: `// euclid(pulses, steps) spreads onsets evenly but unevenly, so a row of
// lights blinks in a rhythm rather than in lockstep.
size(24, 12); fps(12); cycle(8);

const lamp = (c) => circle(1, c);

out(stack(
  solid('#181425'),
  ...[[3, 8], [5, 8], [2, 8]].map(([p, s], i) =>
    lamp(['#ef7d57', '#a7f070', '#41a6f6'][i])
      .euclid(p, s)
      .shift(6 + i * 6, 5),
  ),
));
`,
  },
  {
    id: 'jux',
    name: 'A/B with jux',
    teaches: 'Compare a transform against the original, live',
    code: `// jux puts the original on the left half of the canvas and a transformed
// copy on the right. Borrowed from Strudel's stereo trick.
// Swap the transform and watch both halves at once.
size(32, 16); fps(10); cycle(8);

out(sprite(\`
  ..ww..
  .wwww.
  wwrrww
  .wwww.
  ..ww..
\`)
  .pal({ w: '#c0cbdc', r: '#e43b44' })
  .center()
  .jux((p) => p.every(2, (q) => q.rot(90)).tint('#a7f070')));
`,
  },
  {
    id: 'tile',
    name: 'Tileset',
    teaches: 'Rule-based tiling, one operator',
    code: `// A tile plus tile() fills any canvas, so a texture is authored once at
// its real size. Add .degrade() for grit.
size(32, 32); fps(8); cycle(16);

out(sprite(\`
  nnnnsnnn
  nsnnnnns
  nnnsnnnn
  snnnnsnn
  nnnnnnns
  nnsnnnnn
  nnnnnsnn
  snnnnnnn
\`)
  .pal({ n: '#7a2032', s: '#b03432' })
  .tile()
  .over(noise(3, true).dither('#00000000', '#ffffff18')));
`,
  },
  {
    id: 'plasma',
    name: 'Plasma',
    teaches: 'A raw (x, y, t) function is a pattern too',
    code: `// fn() takes the whole thing down to first principles: any function of
// position and time is a pattern, and dithering it keeps it in the palette.
size(32, 32); fps(20); cycle(32);

out(fn((x, y, t) => {
  const v = Math.sin(x / 3 + t / 6) + Math.sin(y / 4 - t / 9);
  return grey(((v + 2) / 4) * 255);
}).dither('#29366f', '#73eff7'));
`,
  },
  {
    id: 'stickman-running',
    name: 'Stickman - Running',
    teaches: 'Limbs from angles: a 16-frame sprint drawn by distance fields',
    code: `// stickman_009c — 16-frame stickman sprinting jump, 16x16
size(16, 16); fps(16); cycle(16);

const T = rgb(0, 0, 0, 0);
const INK = color('#181425');
const FAR = color('#8b9bb4');

const seg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const k = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - k * dx, py - ay - k * dy);
};

const limb = (x0, y0, a1, a2, l1, l2) => {
  const kx = x0 + Math.sin(a1) * l1, ky = y0 + Math.cos(a1) * l1;
  const fx = kx + Math.sin(a1 + a2) * l2, fy = ky + Math.cos(a1 + a2) * l2;
  return [x0, y0, kx, ky, fx, fy];
};

const bump = (f, c, w) => {
  const d = Math.min(1, Math.abs(f - c) / w);
  return 0.5 + 0.5 * Math.cos(d * Math.PI);
};
const mix = (a, b, k) => a + (b - a) * k;

let cacheT = -1, parts = null;
const pose = (t) => {
  if (t === cacheT) return parts;
  cacheT = t;
  const f = t % 16;
  const p = f / 16 * Math.PI * 4;                         // two sprint strides per loop
  const L = bump(f, 9.5, 4);                              // blend into the leap
  const u = (f - 6) / 7;
  const h = u > 0 && u < 1 ? 4 * u * (1 - u) * 2.2 : 0;  // flight arc
  const bob = -Math.abs(Math.sin(p)) * 1.2 + 0.6;
  const hx = 7, hy = 9.5 + bob * (1 - L) - h;
  const sx = hx + 1.3, sy = hy - 3.8;                     // sprint lean
  const leap = [[1.1, -0.2], [-0.9, -1.0]];               // split: lead leg out, trail leg back
  const legs = [0, Math.PI].map((o, i) => {
    const ra1 = Math.sin(p + o) * 1.0;
    const ra2 = -(0.3 + Math.max(0, Math.cos(p + o)) * 1.6);
    return limb(hx, hy, mix(ra1, leap[i][0], L), mix(ra2, leap[i][1], L), 3, 3.2);
  });
  const arms = [0, Math.PI].map((o, i) => {
    const ra1 = Math.sin(p + o + Math.PI) * 1.1;
    return limb(sx, sy, mix(ra1, i ? 2.2 : 2.6, L), mix(1.5, 0.4, L), 2.2, 2);
  });
  parts = { hx, hy, sx, sy, legs, arms, head: [sx + 0.7, sy - 2.1] };
  return parts;
};

const hit = (x, y, l) => seg(x, y, l[0], l[1], l[2], l[3]) < 0.6 || seg(x, y, l[2], l[3], l[4], l[5]) < 0.6;

const man = fn((x, y, t) => {
  const P = pose(t);
  const cx = x + 0.5, cy = y + 0.5;
  if (Math.hypot(cx - P.head[0], cy - P.head[1]) < 1.5) return INK;
  if (seg(cx, cy, P.hx, P.hy, P.sx, P.sy) < 0.6) return INK;
  if (hit(cx, cy, P.legs[0]) || hit(cx, cy, P.arms[0])) return INK;
  if (hit(cx, cy, P.legs[1]) || hit(cx, cy, P.arms[1])) return FAR;
  return T;
});

out(man);
`,
  },
  {
    id: 'caveman-exploding',
    name: 'Caveman - Exploding',
    teaches: 'A character that comes apart: particles over a 16-frame loop',
    code: `// stickman_009n_vaporize — Caveman vaporized into a blood mist, arcade death effect, 16-frame loop, 48x48
size(48, 48); fps(12); cycle(16);

const T = rgb(0, 0, 0, 0);
const ramp4 = (a) => a.map((h) => color(h));              // highlight, base, shade, deep
const SKIN = ramp4(['#e8b080', '#c48458', '#9a5e3a', '#6c3e26']);   // sun-browned skin
const FUR = ramp4(['#d8a868', '#b08040', '#86602c', '#5a3e1c']);    // hide tunic
const SPOT = ramp4(['#8a6436', '#6a4a26', '#4e361a', '#342410']);   // hide spots
const HAIR = ramp4(['#6a4a32', '#4e3422', '#382416', '#24160c']);   // wild hair, beard
const BONE = ramp4(['#f4ecd8', '#d8ccb0', '#b0a488', '#80765e']);   // bone necklace
const LINE = '#3a2a1e';                                   // soft outline
const S = 2.4;
const GROUND = 44;
const REAR = 17;                                          // rear foot, never moves

const tone = (px, py, ax, ay, bx, by, r, far) => {
  const dx = bx - ax, dy = by - ay;
  const k = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  const ox = px - ax - k * dx, oy = py - ay - k * dy;
  const d = Math.hypot(ox, oy);
  if (d >= r) return -1;
  const s = (ox * 0.6 + oy * 0.8) / r;
  return Math.max(0, Math.min(3, Math.round(1 + s * 1.3 + (far ? 1 : 0))));
};

const limb = (x0, y0, a1, a2, l1, l2, tip) => {
  const kx = x0 + Math.sin(a1) * l1, ky = y0 + Math.cos(a1) * l1;
  const b = a1 + a2;
  const fx = kx + Math.sin(b) * l2, fy = ky + Math.cos(b) * l2;
  return [x0, y0, kx, ky, fx, fy, fx + Math.cos(b) * tip, fy - Math.sin(b) * tip];
};

// Two-bone leg IK: hip -> ankle, knee bends forward, flat foot
const L1 = 2.8 * S, L2 = 2.8 * S;
const legIK = (hx, hy, ax, ay) => {
  const dx = ax - hx, dy = ay - hy, d = Math.min(Math.hypot(dx, dy), L1 + L2 - 0.01);
  const h = Math.sqrt(Math.max(0, L1 * L1 - d * d / 4));
  const ux = dx / d, uy = dy / d;
  const kx = hx + ux * d / 2 + uy * h, ky = hy + uy * d / 2 - ux * h;
  return [hx, hy, kx, ky, ax, ay, ax + 1.3 * S, ay];
};

// Standing pose (frame 0 of the throw, spear stowed): hipX, hipY, lean, arm a1, a2, free a1, a2, front foot x
const mix = (a, b, k) => a + (b - a) * k;
const STAND = [22.0, 33.0, 0.05, -2.5, -0.9, 0.5, 0.4, 27];
const pose = () => {
  const [hx, hy0, lean, ta1, ta2, fa1, fa2, fx] = STAND;
  const reach = L1 + L2 - 0.4;
  const hy = Math.max(hy0, GROUND - Math.sqrt(reach * reach - (hx - REAR) ** 2), GROUND - Math.sqrt(reach * reach - (hx - fx) ** 2));
  const sx = hx + Math.sin(lean) * 3.5 * S + 0.3 * S, sy = hy - Math.cos(lean) * 3.5 * S;
  const legs = [legIK(hx, hy, REAR, GROUND), legIK(hx, hy, fx, GROUND)];
  const arms = [limb(sx, sy, ta1, ta2, 2.1 * S, 1.9 * S, 0), limb(sx, sy, fa1, fa2, 2.1 * S, 1.9 * S, 0)];
  const head = [sx + Math.sin(lean) * 2 * S + 0.6 * S, sy - Math.cos(lean) * 2 * S];
  return { hx, hy, sx, sy, legs, arms, head };
};

// Hide with irregular dark spots, measured relative to the hip
const hide = (rx, ry, i) => (Math.sin(rx * 1.3 + ry * 0.7) + Math.sin(ry * 1.1 - rx * 0.6 + 2) > 1.2 ? SPOT[i] : FUR[i]);

const BOOT = SKIN, KNEE = SKIN, HAND = SKIN;
const legF = (rx, ry, i, shin) => !shin && ry < 3.2 ? hide(rx, ry, i) : SKIN[i];
const armF = (rx, ry, i, fore) => fore && ry > -1.2 && ry < -0.4 ? FUR[Math.min(3, i + 1)] : SKIN[i];

const R = 0.64 * S;
const legAt = (x, y, l, far, P) => {
  let i = tone(x, y, l[4], l[5], l[6], l[7], 0.6 * S, far);
  if (i >= 0) return BOOT[i];
  const bx = l[2] + (l[4] - l[2]) * 0.7, by = l[3] + (l[5] - l[3]) * 0.7;
  i = tone(x, y, bx, by, l[4], l[5], R, far);
  if (i >= 0) return BOOT[i];
  i = tone(x, y, l[2], l[3], l[2], l[3], R + 0.3, far);
  if (i >= 0 && !far) return KNEE[i];
  i = tone(x, y, l[0], l[1], l[2], l[3], R + 0.15, far);
  if (i >= 0) return legF(x - P.hx, y - P.hy, i, false);
  i = tone(x, y, l[2], l[3], l[4], l[5], R, far);
  return i >= 0 ? legF(x - P.hx, y - P.hy, i, true) : null;
};
const armAt = (x, y, l, far, P) => {
  let i = tone(x, y, l[4] - (l[4] - l[2]) * 0.25, l[5] - (l[5] - l[3]) * 0.25, l[4], l[5], R - 0.1, far);
  if (i >= 0) return HAND[i];
  i = tone(x, y, l[0], l[1], l[2], l[3], R, far);
  if (i >= 0) return armF(x - P.hx, y - P.hy, i, false);
  i = tone(x, y, l[2], l[3], l[4], l[5], R - 0.1, far);
  return i >= 0 ? armF(x - P.hx, y - P.hy, i, true) : null;
};

const rawAt = (x, y, P) => {
  const cx = x + 0.5, cy = y + 0.5;
  const c = armAt(cx, cy, P.arms[0], false, P);
  if (c) return c;
  const lg = legAt(cx, cy, P.legs[0], false, P);
  if (lg) return lg;
  const [qx, qy] = P.head;
  const dy = cy - qy, dx = cx - qx;
  const hi = tone(cx, cy, qx + 0.1 * S, qy, qx + 0.1 * S, qy, 1.45 * S, false);
  if (hi >= 0 && dx > -0.3 * S && dy > -0.9 * S) {
    if (dy > 0.3 * S && dx < 1.1 * S) return HAIR[hi];                          // beard
    if (dx > 0.6 * S && Math.abs(dy + 0.45 * S) < 0.15 * S) return HAIR[2];      // brow
    return SKIN[hi];
  }
  const mane = tone(cx, cy, qx - 0.3 * S, qy - 0.3 * S, qx - 0.5 * S, qy + 0.8 * S, 1.75 * S + Math.sin(cy * 1.7) * 0.25 * S, false);
  if (mane >= 0 && dx < 1.3 * S) return HAIR[mane];
  const vest = tone(cx, cy, P.hx + 0.1 * S, P.hy - 1.2 * S, P.sx, P.sy + 0.2 * S, 1.3 * S, false);
  if (vest >= 0) {
    if (Math.abs(cy - (P.sy + 0.5 * S) - (cx - P.sx) * 0.3) < 0.2 * S && cx > P.sx - 0.2 * S) return BONE[vest];
    if (cy < P.sy + 0.4 * S + (P.sx - cx) * 0.5) return SKIN[vest];
    return hide(cx - P.hx, cy - P.hy, vest);
  }
  const ti = tone(cx, cy, P.hx, P.hy, P.sx, P.sy, 1.05 * S, false);
  if (ti >= 0) return Math.abs(cy - (P.hy - 0.4 * S)) < 0.25 * S ? HAIR[ti] : hide(cx - P.hx, cy - P.hy, ti);
  return armAt(cx, cy, P.arms[1], true, P) || legAt(cx, cy, P.legs[1], true, P) || T;
};

// Denoise: render once into a 48x48 buffer, then clean speckle
const W = 48, H = 48;
const MAT = new Map();
[SKIN, FUR, SPOT, HAIR, BONE].forEach((r, m) => r.forEach((c) => MAT.set(c, m)));
MAT.set(T, -1);
const cleanPass = (src, sameMat) => {
  const dst = src.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = src[y * W + x];
    const nb = [];
    if (x > 0) nb.push(src[y * W + x - 1]);
    if (x < W - 1) nb.push(src[y * W + x + 1]);
    if (y > 0) nb.push(src[(y - 1) * W + x]);
    if (y < H - 1) nb.push(src[(y + 1) * W + x]);
    if (nb.includes(c)) continue;
    const pool = sameMat ? nb.filter((n) => MAT.get(n) === MAT.get(c)) : nb;
    if (!pool.length) continue;
    let best = pool[0], bn = 0;
    for (const n of pool) {
      const k = pool.filter((m) => m === n).length;
      if (k > bn) { bn = k; best = n; }
    }
    dst[y * W + x] = best;
  }
  return dst;
};
const frameBuf = () => {
  let b = new Array(W * H);
  const P = pose();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[y * W + x] = rawAt(x, y, P);
  b = cleanPass(b, true);
  b = cleanPass(b, false);
  return cleanPass(b, false);
};

// ---- Vaporize: sprite rendered once (spear stowed), then burst into per-pixel particles ----
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RGBOF = new Map();
[[SKIN, ['#e8b080', '#c48458', '#9a5e3a', '#6c3e26']], [FUR, ['#d8a868', '#b08040', '#86602c', '#5a3e1c']],
 [SPOT, ['#8a6436', '#6a4a26', '#4e361a', '#342410']], [HAIR, ['#6a4a32', '#4e3422', '#382416', '#24160c']],
 [BONE, ['#f4ecd8', '#d8ccb0', '#b0a488', '#80765e']]].forEach(([r, hs]) => r.forEach((c, i) => RGBOF.set(c, hexRGB(hs[i]))));
const BLOOD = ['#ff5a5a', '#d61f2c', '#9c1020', '#5e0814'].map(hexRGB);
const BLOODC = BLOOD.map((c) => rgb(c[0], c[1], c[2]));
const FLASH = [255, 236, 232];
const lerp3 = (a, b, k) => rgb(Math.round(mix(a[0], b[0], k)), Math.round(mix(a[1], b[1], k)), Math.round(mix(a[2], b[2], k)));
const hash = (n) => { let h = (n * 374761393 + 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const SPR = frameBuf(0);
const PIX = [];
for (let i = 0; i < W * H; i++) if (SPR[i] && SPR[i] !== T && RGBOF.has(SPR[i])) PIX.push(i);
const P0 = pose(0);
const CX = P0.sx - 0.5, CY = P0.sy + 3;                    // chest
const DRAG = 0.8, GRAV = 0.35, T0 = 4;
// Clusters: jittered coarse cells group 2-6 neighbours; ~45% of pixels fly alone
const PARTS = PIX.map((i, n) => {
  const x = i % W, y = Math.floor(i / W);
  const lone = hash(n * 13 + 7) < 0.45;
  const gx = Math.floor((x + 3 * hash(y * 7 + 3)) / (2 + Math.floor(hash(y * 5 + 1) * 2)));
  const gy = Math.floor((y + 2 * hash(x * 11 + 4)) / 2);
  const g = lone ? 5000 + n : gx * 97 + gy;
  const jx = hash(n * 17 + 1) - 0.5, jy = hash(n * 19 + 2) - 0.5;
  const ang = Math.atan2(y - CY + (hash(g * 23 + 1) - 0.5) * 6, x - CX + (hash(g * 29 + 2) - 0.5) * 6) + (hash(g * 31 + 3) - 0.5) * 0.9;
  const sp = 0.9 + Math.pow(hash(g * 37 + 4), 1.6) * 5.5;
  const spread = lone ? 0 : 0.45;
  return {
    x: x + jx, y: y + jy,
    vx: Math.cos(ang) * sp + (hash(n * 41 + 5) - 0.5) * spread,
    vy: Math.sin(ang) * sp - 0.6 - hash(g * 43 + 6) * 0.8 + (hash(n * 47 + 7) - 0.5) * spread,
    rgb: RGBOF.get(SPR[i]), shade: Math.floor(hash(n * 11 + 5) * 3),
    del: Math.floor(hash((lone ? n * 53 : g * 59) + 8) * 3),
    life: 4 + hash(n * 61 + 9) * 6,
  };
});
const drift = (v, k) => v * (1 - Math.pow(DRAG, k)) / (1 - DRAG);
const grain = (x, y, f) => hash((x * 73856093) ^ (y * 19349663) ^ (f * 83492791));

let fxT = -1, fx = null;
const fxFrame = (t) => {
  if (t === fxT) return fx;
  fxT = t;
  const f = t % 16;
  const g = new Array(W * H).fill(null);
  const put = (x, y, c) => { const ix = Math.round(x), iy = Math.round(y); if (ix >= 0 && iy >= 0 && ix < W && iy < H) g[iy * W + ix] = c; };
  if (f === 3) { PIX.forEach((i) => { g[i] = lerp3(FLASH, BLOOD[0], 0.2); }); fx = g; return g; }
  if (f < T0) { fx = null; return null; }
  const k = f - T0 + 1;
  // mist: noise-dithered expanding ring of light reds, thinning out
  const mr = 4 + k * 2.2, dens = Math.max(0, 0.55 - k * 0.05);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - CX, (y - CY - k * 0.6) * 1.2);
    const a = dens * Math.max(0, 1 - d / mr);
    if (a * 16 > grain(x, y, f) * 16) g[y * W + x] = d < mr * 0.5 ? BLOODC[1] : BLOODC[0];
  }
  // ground splat: grows, then fades by loop end
  const sw = Math.min(9, 3 + k * 1.2), sa = f >= 12 ? (15 - f) / 4 : 1;
  for (let x = Math.floor(CX - sw); x <= CX + sw; x++) {
    const e = Math.abs(x - CX) / sw;
    if (e < 1 && hash(x * 13) * 0.4 + sa > e * 0.9 + 0.35) { put(x, GROUND, e < 0.5 ? BLOODC[2] : BLOODC[3]); if (e < 0.4 && sa > 0.5) put(x, GROUND - 1, BLOODC[2]); }
  }
  // particles
  PARTS.forEach((p) => {
    const kk = k - p.del;
    if (kk <= 0) { put(p.x, p.y, BLOODC[0]); return; }
    const px = p.x + drift(p.vx, kk), py = p.y + drift(p.vy, kk) + 0.5 * GRAV * kk * kk;
    if (py > GROUND || kk > p.life) return;            // soaked into the dirt / evaporated
    const c = kk <= 3 ? lerp3(p.rgb, BLOOD[1 + (p.shade > 1 ? 1 : 0)], kk / 3) : BLOODC[Math.min(3, 1 + p.shade + (kk > 6 ? 1 : 0))];
    put(px, py, c);
  });
  fx = g;
  return g;
};

const intact = fn((x, y, t) => {
  const ix = Math.floor(x), iy = Math.floor(y), f = t % 16;
  if (f > 3 || ix < 0 || iy < 0 || ix >= W || iy >= H) return T;
  const sx = f === 2 ? ix - (((iy >> 1) + t) & 1 ? 1 : 0) : ix;
  if (sx < 0) return T;
  return SPR[iy * W + sx] || T;
}).outline(LINE);
const burst = fn((x, y, t) => {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return T;
  const g = fxFrame(t);
  return g ? g[iy * W + ix] || T : T;
});

out(stack(intact, burst));
`,
  },
  {
    id: 'compact-oops',
    name: 'Beige Compact - Oops',
    teaches: 'A whole short film in one sketch: channel flips, then a bat',
    code: `// Beige compact, 1990s, colour model: an all-in-one desk computer turned a quarter away, raymarched once into a baked beige ramp. Its 16-colour CRT flips through four channels with a collapse / static / roll-in channel change: CH 3 dusk runner, CH 4 space shooter, CH 7 sunset racer, CH 9 undersea. Then someone steps in from behind, over the shoulder, and takes a bat to it: two hits, cracked glass, sparks, shards, smoke (512x512).
size(512, 512); fps(12); cycle(256);

const T = rgb(0, 0, 0, 0);
const N = 512;

// ---------- palettes ----------
const BEIGE = [[44, 38, 32], [78, 70, 58], [112, 102, 86], [146, 136, 116], [176, 166, 144], [202, 193, 171], [224, 216, 196], [242, 236, 220]];
const BODY = BEIGE.map(([r, g, b]) => rgb(r, g, b));
const INK = rgb(36, 31, 26), SHADOW = rgb(58, 52, 46);
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a)); return k * k * (3 - 2 * k); };
const hash = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

// ---------- camera: orthographic, a quarter turn and looking a little down ----------
const YAW = -.55, PITCH = .3, SCALE = 11, LIFT = -12;
const cy = Math.cos(YAW), sy = Math.sin(YAW), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
const toObj = (x, y, z) => {
  const y1 = y * cp + z * sp, z1 = -y * sp + z * cp;
  return [x * cy - z1 * sy, y1, x * sy + z1 * cy];
};
const LIGHT = (() => { const l = [-.55, .7, .55], m = Math.hypot(...l); return l.map((v) => v / m); })();
const LIGHT_OBJ = (() => { const [x, y, z] = toObj(...LIGHT); return [x, y, z]; })();

// ---------- the case, as signed distances ----------
const box = (x, y, z, bx, by, bz, r) => {
  const qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r, qz = Math.abs(z) - bz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
};
const HW = 12, HH = 16.5, HD = 13.5;
const GLASS = { cx: 0, cy: 6, hx: 8, hy: 6 };

const parts = (x, y, z) => {
  const body = box(x, y, z, HW, HH, HD, 1.8);
  const recess = box(x, y - 6, z - 13.9, 9.2, 7.2, 1.9, 1.4);
  const glass = box(x, y - 6, z - 12, GLASS.hx, GLASS.hy, .45, .45);
  const slot = box(x - 4.5, y + 9, z - 13.5, 3.8, .4, 1.2, .2);
  const seam = box(x, y + 13.2, z - 13.5, 13, .22, .35, .05);
  let vent = 1e9;
  for (let i = 0; i < 6; i++) vent = Math.min(vent, box(x - HW, y - 11 + i * 1.5, z + 4, .5, .25, 7, .1));
  return { body, recess, glass, slot, seam, vent };
};
const sdf = (x, y, z) => {
  const p = parts(x, y, z);
  const shell = Math.max(p.body, -p.recess, -p.slot, -p.seam, -p.vent);
  return Math.min(shell, p.glass);
};
const normal = (x, y, z) => {
  const e = .05;
  const nx = sdf(x + e, y, z) - sdf(x - e, y, z);
  const ny = sdf(x, y + e, z) - sdf(x, y - e, z);
  const nz = sdf(x, y, z + e) - sdf(x, y, z - e);
  const m = Math.hypot(nx, ny, nz) || 1;
  return [nx / m, ny / m, nz / m];
};

// ---------- bake the case once ----------
// kind: 0 empty, 1 case, 2 screen, 3 shadow, 4 outline
const kind = new Uint8Array(N * N), tone = new Uint8Array(N * N);
const su = new Float32Array(N * N), sv = new Float32Array(N * N);
let baked = false;
let GCX = 0, GCY = 0, DESK_Y = 0;

const bake = () => {
  const dir = toObj(0, 0, -1);
  let gCount = 0;
  for (let Y = 0; Y < N; Y++) {
    for (let X = 0; X < N; X++) {
      const i = Y * N + X;
      const wx = (X + .5 - N / 2) / SCALE, wy = -(Y + .5 - N / 2 - LIFT) / SCALE;
      const o = toObj(wx, wy, 60);
      let s = 0, hit = false;
      for (let k = 0; k < 90 && s < 140; k++) {
        const d = sdf(o[0] + dir[0] * s, o[1] + dir[1] * s, o[2] + dir[2] * s);
        if (d < .01) { hit = true; break; }
        s += d;
      }
      if (!hit) {
        const g = (-HH - o[1]) / dir[1];
        const gx = o[0] + dir[0] * g - 2.5, gz = o[2] + dir[2] * g + 2;
        const dx = Math.max(Math.abs(gx) - HW, 0), dz = Math.max(Math.abs(gz) - HD, 0);
        const a = .42 * (1 - smooth(0, 7, Math.hypot(dx, dz)));
        if (a > (BAYER[(Y >> 1) & 3][(X >> 1) & 3] + .5) / 16) kind[i] = 3;
        continue;
      }
      const px = o[0] + dir[0] * s, py = o[1] + dir[1] * s, pz = o[2] + dir[2] * s;
      const p = parts(px, py, pz);
      if (p.glass < .03) {
        kind[i] = 2;
        GCX += X; GCY += Y; gCount++;
        su[i] = (px - GLASS.cx + GLASS.hx) / (2 * GLASS.hx);
        sv[i] = (GLASS.cy + GLASS.hy - py) / (2 * GLASS.hy);
        continue;
      }
      const n = normal(px, py, pz);
      let ao = 0;
      for (const h of [.4, .9, 1.6]) ao += clamp(sdf(px + n[0] * h, py + n[1] * h, pz + n[2] * h) / h);
      ao /= 3;
      const cavity = -p.slot > -.05 || -p.vent > -.05 ? .45 : 1;
      const lam = Math.max(0, n[0] * LIGHT_OBJ[0] + n[1] * LIGHT_OBJ[1] + n[2] * LIGHT_OBJ[2]);
      const v = (.3 + .72 * lam) * (.35 + .65 * ao) * cavity;
      const dith = (BAYER[(Y >> 1) & 3][(X >> 1) & 3] / 16 - .47) * .9 / BODY.length;
      kind[i] = 1;
      tone[i] = Math.round(clamp(v + dith) * (BODY.length - 1));
      if (Y > DESK_Y) DESK_Y = Y;
    }
  }
  const solid = (x, y) => x >= 0 && y >= 0 && x < N && y < N && (kind[y * N + x] === 1 || kind[y * N + x] === 2);
  for (let Y = 0; Y < N; Y++) for (let X = 0; X < N; X++) {
    const i = Y * N + X;
    if (kind[i] === 1 || kind[i] === 2) continue;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (solid(X + dx, Y + dy)) { kind[i] = 4; break; }
    }
  }
  GCX /= gCount; GCY /= gCount;
  baked = true;
};

// ---------- the colour screen ----------
const SW = 64, SH = 48, FLOOR = 38;
const scr = new Uint8Array(SW * SH);
const px = new Uint8ClampedArray(SW * SH * 3);
const src = new Uint8ClampedArray(SW * SH * 3);
const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < SW && y < SH) scr[y * SW + x] = c; };
const setPx = (x, y, r, g, b) => { if (x >= 0 && y >= 0 && x < SW && y < SH) { const j = (y * SW + x) * 3; px[j] = r; px[j + 1] = g; px[j + 2] = b; } };
const resolve = (pal) => { for (let i = 0; i < SW * SH; i++) { const c = pal[scr[i]]; px[i * 3] = c[0]; px[i * 3 + 1] = c[1]; px[i * 3 + 2] = c[2]; } };
const b4 = (x, y) => (BAYER[y & 3][x & 3] + .5) / 16;
const stamp = (rows, inks, x0, y0) => rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (inks[row[c]] !== undefined) put(x0 + c, y0 + r, inks[row[c]]); });
const shade = (x, y, k, stops) => { const lo = Math.floor(k); return stops[Math.min(stops.length - 1, k - lo > b4(x, y) ? lo + 1 : lo)]; };

const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
const drawScore = (value, col) => {
  [...String(value % 10000).padStart(4, '0')].forEach((ch, n) => {
    const g = DIGITS[+ch];
    for (let b = 0; b < 15; b++) if (g[b] === '1') put(2 + n * 4 + (b % 3), 2 + Math.floor(b / 3), col);
  });
};

// ================= CH 3: dusk runner =================
const PAL_A = [
  [22, 18, 58], [48, 32, 110], [120, 50, 140], [230, 100, 120],
  [255, 170, 90], [255, 240, 170], [70, 40, 110], [28, 70, 90],
  [60, 150, 70], [30, 90, 50], [210, 110, 60], [130, 60, 40],
  [20, 20, 30], [240, 240, 240], [255, 210, 60], [50, 110, 120],
];
const RUN_A = ['..####..', '.######.', '.###oo#.', '.######.', '..####..', '.#wwww..', '#.####..', '..####..', '.##..##.', '##....##'];
const RUN_B = ['..####..', '.######.', '.###oo#.', '.######.', '..####..', '..wwww..', '.#.####.', '..####..', '..####..', '..##.##.'];
const INKS = { '#': 12, o: 13, w: 13 };
const SKY = [0, 1, 2, 3, 4];

const drawA = (t) => {
  const scroll = t * 2;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) put(x, y, shade(x, y, clamp(y / 33) * (SKY.length - 1), SKY));
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(((hash(i) * SW * 2 - scroll * .15) % SW + SW) % SW), y = Math.floor(hash(i + 50) * 16);
    if ((t + i * 3) % 11) put(x, y, i % 3 ? 5 : 13);
  }
  for (let y = 2; y < 16; y++) for (let x = 40; x < 58; x++) {
    if (Math.hypot(x - 49, y - 8) < 5.5 && Math.hypot(x - 46.5, y - 6.5) > 4.6) put(x, y, 5);
  }
  for (let x = 0; x < SW; x++) {
    const q = x + scroll * .5;
    const h = Math.round(25 + 4 * Math.sin(q * .13) + 3 * Math.sin(q * .31 + 1));
    for (let y = h; y < FLOOR; y++) put(x, y, 6);
  }
  for (let x = 0; x < SW; x++) {
    const q = x + scroll;
    const h = Math.round(32 + 3 * Math.sin(q * .09 + 2) + 2 * Math.sin(q * .23));
    for (let y = h; y < FLOOR; y++) put(x, y, y - h < 1 ? 15 : 7);
  }
  for (let x = 0; x < SW; x++) {
    put(x, FLOOR, 10);
    for (let y = FLOOR + 1; y < SH; y++) put(x, y, (x + scroll + y) % 6 < 3 ? 9 : 8);
  }
  const RX = 12;
  let nearest = 1e9;
  const base = Math.floor(scroll / 40);
  const kEnd = base + 3;
  for (let k = base - 1; k < kEnd; k++) {
    const bx = 70 + k * 40 - scroll;
    const d = bx - (RX + 4);
    if (d > -6 && d < nearest) nearest = d;
    const bEnd = bx + 4;
    for (let y = FLOOR - 7; y < FLOOR; y++) for (let x = bx; x < bEnd; x++) {
      const mortar = (y - FLOOR) % 3 === 0 || (x - bx + (Math.floor((y - FLOOR) / 3) & 1) * 2) % 4 === 0;
      put(x, y, x === bx + 3 ? 11 : y === FLOOR - 7 ? 4 : mortar ? 11 : 10);
    }
  }
  const u = (nearest - 5) / 10;
  const hop = Math.abs(u) < 1 ? Math.round(11 * (1 - u * u)) : 0;
  const sprite = hop > 0 ? RUN_B : (t % 2 ? RUN_A : RUN_B);
  const top = FLOOR - sprite.length - hop;
  stamp(sprite, INKS, RX, top);
  put(RX - 1 - (t % 2), top + 5, 12); put(RX - 2, top + 6 - (t % 2), 12);
  drawScore(Math.floor(t / 3), 14);
};

// ================= CH 4: space shooter =================
const PAL_B = [
  [6, 6, 20], [16, 14, 40], [40, 30, 80], [90, 50, 120],
  [220, 220, 240], [110, 110, 150], [200, 90, 50], [110, 45, 40],
  [240, 200, 120], [180, 190, 210], [80, 90, 120], [255, 140, 40],
  [120, 100, 80], [70, 58, 48], [255, 220, 90], [120, 255, 255],
];
const SHIP = ['.hh......', 'hhhhhs...', 'shhhhhhhh', 'hhhhhs...', '.hh......'];
const SHIP_INK = { h: 9, s: 10 };
const SX = 4, HIT = 30, GAP = 16, SPEED = 1.5;
const HIT_T = (SW + 4 - HIT) / SPEED;
const rockX = (k, t) => SW + 4 - (t - k * GAP) * SPEED;
const rockY = (k) => 8 + Math.floor(hash(k * 3.7 + 1) * 26);
const STAR_LAYERS = [[.25, 5, 14], [.6, 5, 10], [1.4, 4, 6]];

const drawB = (t) => {
  const s = t * .6;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    put(x, y, clamp(y / SH * 1.4) > b4(x, y) ? 1 : 0);
    const q = x + s * .3;
    const n = Math.sin(q * .12 + Math.sin(y * .21) * 2) * Math.sin(y * .17 + q * .05);
    if (n > .35 + b4(x, y) * .35) put(x, y, 3);
    else if (n > .08 + b4(x, y) * .35) put(x, y, 2);
  }
  STAR_LAYERS.forEach(([spd, col, count], L) => {
    for (let i = 0; i < count; i++) {
      const x = Math.floor(((hash(i + L * 100) * SW * 3 - t * spd) % SW + SW) % SW), y = Math.floor(hash(i + L * 100 + 50) * SH);
      put(x, y, col);
      if (spd > 1) put(x + 1, y, 5);
    }
  });
  const pcx = 50, pcy = 37, pr = 9;
  const pyStart = pcy - 12, pxStart = pcx - 20;
  for (let y = pyStart; y < SH; y++) for (let x = pxStart; x < SW; x++) {
    const d = Math.hypot(x - pcx, y - pcy);
    const ry = y - pcy + (x - pcx) * .15;
    if (d < pr) {
      const lit = (-(x - pcx) * .6 - (y - pcy) * .7) / pr * .6 + .55;
      put(x, y, lit > b4(x, y) ? 6 : 7);
    }
    const ex = (x - pcx) / 17, ey = ry / 3.5;
    const e = ex * ex + ey * ey;
    if (Math.abs(e - 1) < .2 && (d >= pr || ry > 0)) put(x, y, 8);
  }
  const kt = Math.floor((t - HIT_T) / GAP) + 1;
  const kFirst = kt - 2, kLast = kt + 4;
  for (let k = kFirst; k < kLast; k++) {
    const rx = rockX(k, t);
    if (rx > SW + 5) continue;
    const ry = rockY(k);
    if (rx > HIT) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const rr = 3 + .9 * Math.sin(Math.atan2(dy, dx) * 3 + k);
        if (Math.hypot(dx, dy) < rr) put(rx + dx, ry + dy, dx + dy > 0 ? 13 : 12);
      }
      put(rx - 1, ry - 1, 13);
    } else if (rx > HIT - 6) {
      const age = (HIT - rx) / SPEED, rad = 1 + age * 1.6;
      for (let a = 0; a < 8; a++) put(HIT + Math.cos(a * Math.PI / 4) * rad, ry + Math.sin(a * Math.PI / 4) * rad, age < 2 ? 14 : 11);
      if (age < 1.5) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(HIT + dx, ry + dy, dx || dy ? 14 : 4);
    }
  }
  const yA = rockY(kt - 1), yB = rockY(kt);
  const ys = yA + (yB - yA) * smooth(0, 8, t - ((kt - 1) * GAP + HIT_T));
  const top = Math.round(ys + Math.sin(t * .5)) - 2;
  stamp(SHIP, SHIP_INK, SX, top);
  put(SX - 1, top + 2, t % 2 ? 11 : 14);
  if (t % 2) put(SX - 2, top + 2, 11);
  const tx = rockX(kt, t);
  const beamStart = SX + 9, beamEnd = Math.round(tx) - 3;
  if (tx < 40 && t % 3 !== 2) for (let x = beamStart; x < beamEnd; x++) put(x, top + 2, 15);
  drawScore(kt * 50, 14);
};

// ================= CH 7: sunset racer =================
const PAL_C = [
  [30, 10, 60], [90, 20, 100], [200, 50, 110], [255, 120, 90],
  [255, 200, 80], [60, 20, 70], [30, 110, 60], [20, 80, 45],
  [70, 70, 80], [60, 60, 70], [230, 230, 230], [220, 40, 50],
  [20, 20, 30], [120, 30, 40], [255, 210, 60], [120, 200, 255],
];
const CAR = [
  '....rrrrrrrr....',
  '...rggggggggr...',
  '..rrrrrrrrrrrr..',
  '.rrrrrrrrrrrrrr.',
  'rLLrrrrrrrrrrLLr',
  'ddddddkkkkdddddd',
  'kkk..........kkk',
];
const CAR_INK = { r: 11, g: 15, L: 4, k: 12, d: 13 };
const HZ = 22, SKY_C = [0, 1, 2, 3];
const ROAD_TOP = HZ + 1;

const drawC = (t) => {
  const curve = Math.sin(t * .07) * 1.2;
  const mOff = -Math.cos(t * .07) * 8;
  for (let y = 0; y <= HZ; y++) for (let x = 0; x < SW; x++) put(x, y, shade(x, y, clamp(y / HZ) * 3, SKY_C));
  // striped sun
  for (let y = 5; y <= HZ; y++) for (let x = 22; x < 42; x++) {
    if (Math.hypot(x - 32, y - 15) < 9 && !(y > 13 && (y - 13) % 3 === 0)) put(x, y, 4);
  }
  // mountains, sliding against the curve
  for (let x = 0; x < SW; x++) {
    const q = x + mOff;
    const h = Math.round(HZ - 2 - 3 * Math.abs(Math.sin(q * .11)) - 2 * Math.abs(Math.sin(q * .27 + 1)));
    for (let y = h; y <= HZ; y++) put(x, y, 5);
  }
  // road
  for (let y = ROAD_TOP; y < SH; y++) {
    const dy = y - HZ, sc = dy / (SH - HZ);
    const hw = 2 + sc * 24;
    const far = 1 - sc;
    const cx = SW / 2 + curve * far * far * 22 - curve * 4;
    const seg = Math.floor(30 / dy + t * .9) & 1;
    const line = Math.max(.6, sc * 1.2);
    for (let x = 0; x < SW; x++) {
      const dx = Math.abs(x + .5 - cx);
      if (dx < hw) put(x, y, seg && dx < line ? 10 : seg ? 8 : 9);
      else if (dx < hw * 1.15 + .5) put(x, y, seg ? 11 : 10);
      else put(x, y, seg ? 6 : 7);
    }
  }
  stamp(CAR, CAR_INK, Math.round(SW / 2 - 8 - curve * 3), SH - 8 - (t % 4 === 0 ? 1 : 0));
  drawScore(t * 7, 14);
};

// ================= CH 9: undersea =================
const PAL_D = [
  [10, 30, 60], [15, 55, 95], [25, 90, 130], [60, 150, 170],
  [180, 230, 230], [200, 180, 120], [150, 130, 80], [30, 120, 70],
  [20, 80, 50], [255, 140, 40], [255, 230, 200], [240, 200, 40],
  [150, 120, 20], [20, 20, 30], [255, 210, 60], [140, 220, 255],
];
const FISH = ['t.ooo.', 'tooowe', 't.ooo.'];
const FISH_INK = { t: 9, o: 9, w: 10, e: 13 };
const SUB = [
  '.......k......',
  '.......kk.....',
  '.....yyyyy....',
  '..yyyyyyyyyyy.',
  '.yyGyyyGyyyGyy',
  '..sssssssssss.',
];
const SUB_INK = { k: 13, y: 11, G: 15, s: 12 };
const WATER = [0, 1, 2, 3];
const KELP = [6, 15, 44, 57, 61];

const drawD = (t) => {
  const rayShift = Math.sin(t * .08) * 4;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    put(x, y, shade(x, y, clamp(1 - y / 40) * 3, WATER));
    const band = ((x + y * .5 + rayShift) % 14 + 14) % 14 < 3;
    if (band && (1 - y / 32) * .8 > b4(x, y)) put(x, y, y < 8 ? 4 : 3);
  }
  // sand
  for (let x = 0; x < SW; x++) {
    const h = 41 + Math.round(Math.sin(x * .19) * 1.3 + Math.sin(x * .07 + 2));
    for (let y = h; y < SH; y++) put(x, y, y - h > 2 && b4(x, y) > .5 ? 6 : 5);
  }
  // kelp
  KELP.forEach((kx, k) => {
    const top = Math.round(16 + hash(k) * 10);
    for (let y = top; y < 43; y++) {
      const sway = Math.sin(y * .25 + t * .3 + k) * (42 - y) * .06;
      put(kx + sway, y, 7); put(kx + sway + 1, y, 8);
      if (y % 4 === 0) put(kx + sway + (y % 8 ? 2 : -1), y, 7);
    }
  });
  // fish
  for (let i = 0; i < 7; i++) {
    const fx = Math.round(((hash(i) * 200 + t * (.8 + hash(i + 9) * .8)) % (SW + 12)) - 8);
    const fy = Math.round(6 + hash(i + 20) * 24 + Math.sin(t * .3 + i) * 1.5);
    const flick = (t + i) % 2;
    FISH.forEach((row, r) => {
      const w = row.length;
      for (let c = 0; c < w; c++) {
        const ch = row[c];
        if (ch === '.' || (ch === 't' && r !== 1 && flick)) continue;
        put(fx + c, fy + r, FISH_INK[ch]);
      }
    });
  }
  // submarine
  const subX = Math.round(22 + Math.sin(t * .06) * 8), subY = Math.round(20 + Math.sin(t * .2) * 1.2);
  stamp(SUB, SUB_INK, subX, subY);
  put(subX, subY + 3 + (t % 2) * 2, 13);
  for (let j = 0; j < 4; j++) { const age = (t + j * 2) % 8; put(subX - 1 - age * .5, subY + 4 - age, 4); }
  // bubbles
  for (let i = 0; i < 10; i++) {
    const bx = hash(i * 1.3) * SW + Math.sin(t * .4 + i) * 1.2;
    const by = SH - 6 - ((t * 1.1 + hash(i + 5) * 80) % 46);
    put(bx, by, 4);
  }
};

// ================= channel change =================
const CHANNELS = [
  { n: 3, draw: drawA, pal: PAL_A, t0: 0 },
  { n: 4, draw: drawB, pal: PAL_B, t0: 40 },
  { n: 7, draw: drawC, pal: PAL_C, t0: 0 },
  { n: 9, draw: drawD, pal: PAL_D, t0: 0 },
];
const SHOW = 36, SWITCH = 8, SLOT = SHOW + SWITCH, SMASH0 = SLOT * CHANNELS.length, TOTAL = 256;   // 4 channels, then 80 frames of bat
let curT = 0;

const GLYPH = { C: '111100100100111', H: '101101111101101' };
const drawOSD = (ch) => {
  const text = [...('CH' + ch)];
  for (let pass = 0; pass < 2; pass++) {
    text.forEach((c, n) => {
      const g = GLYPH[c] || DIGITS[+c];
      const gx = 47 + n * 4 + (n > 1 ? 2 : 0);
      for (let b = 0; b < 15; b++) if (g[b] === '1') {
        if (pass) setPx(gx + (b % 3), 3 + Math.floor(b / 3), 90, 255, 120);
        else setPx(gx + (b % 3) + 1, 4 + Math.floor(b / 3), 0, 40, 10);
      }
    });
  }
};

// squash the picture toward the centre: step 0 a thin band, step 1 a bright dash
const squash = (s) => {
  src.set(px);
  const sqy = s ? .04 : .25, sqx = s ? .35 : 1, wash = s ? .75 : .3;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const ix = Math.round((x + .5 - SW / 2) / sqx + SW / 2 - .5), iy = Math.round((y + .5 - SH / 2) / sqy + SH / 2 - .5);
    const j = (y * SW + x) * 3;
    if (ix < 0 || iy < 0 || ix >= SW || iy >= SH) { px[j] = 0; px[j + 1] = 0; px[j + 2] = 0; continue; }
    const k = (iy * SW + ix) * 3;
    for (let c = 0; c < 3; c++) px[j + c] = src[k + c] + (255 - src[k + c]) * wash;
  }
};
// torn signal: bands of rows slide sideways, some invert
const tear = (s) => {
  src.set(px);
  for (let y = 0; y < SH; y++) {
    const band = Math.floor(y / 3);
    const off = hash(band + s * 17) > .45 ? Math.floor((hash(band * 5 + s) - .5) * 24) : 0;
    const inv = hash(band * 3 + s * 7) > .8;
    for (let x = 0; x < SW; x++) {
      const sx2 = ((x + off) % SW + SW) % SW, j = (y * SW + x) * 3, k = (y * SW + sx2) * 3;
      for (let c = 0; c < 3; c++) px[j + c] = inv ? 255 - src[k + c] : src[k + c];
    }
  }
};
const fillScreen = (r, g, b) => { for (let i = 0; i < SW * SH; i++) { px[i * 3] = r; px[i * 3 + 1] = g; px[i * 3 + 2] = b; } };

// steps 0-1 picture collapses to a bright line then a dash, 2-5 static, 6-7 new channel rolls in
const channel = (s, from, fromT, fromPal, to, toT, toPal) => {
  if (s < 2) { from(fromT); resolve(fromPal); squash(s); return false; }
  if (s < SWITCH - 2) {
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      const roll = ((y + curT * 7) % SH) < 7 ? .5 : 1;
      const v = (40 + hash(x * 1.37 + y * 57.1 + curT * 311.7) * 200) * roll;
      setPx(x, y, v, v, v * 1.08);
    }
    return false;
  }
  to(toT); resolve(toPal); src.set(px);
  const off = s === SWITCH - 2 ? 14 : 4, fuzz = s === SWITCH - 2 ? .35 : .12;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const syy = (y + off) % SH, j = (y * SW + x) * 3;
    if (syy >= SH - 2) { px[j] = 0; px[j + 1] = 0; px[j + 2] = 0; continue; }
    const k = (syy * SW + x) * 3, n = hash(x * 3.1 + y * 91.3 + curT * 17.9) * 255;
    for (let c = 0; c < 3; c++) px[j + c] = src[k + c] * (1 - fuzz) + n * fuzz;
  }
  return true;
};

// ================= the bat =================
// timeline inside the smash, in frames: rise in, wind up, hit, wind up, hit, lower the bat, smoke
const HIT1 = 28, HIT2 = 42;
const FW = 256;                                   // overlay grid, 2px cells
const fig = new Uint8Array(FW * FW), part = new Uint8Array(FW * FW);
let smashS = -1, shX = 0, shY = 0;
let IX1 = 0, IY1 = 0, IX2 = 0, IY2 = 0, KEYS = null, J = null;
const REST_HY = 420;
const SHK_X = [8, -5, 3, -1], SHK_Y = [-4, 3, -2, 1];

const FIG_COL = [T, rgb(30, 31, 40), T, rgb(232, 196, 136), rgb(184, 140, 86), rgb(112, 80, 46), rgb(206, 196, 176), INK, T, rgb(44, 42, 50)];
const RIM_ON = rgb(112, 118, 168), RIM_OFF = rgb(62, 64, 78), RIM_FLASH = rgb(240, 240, 250);
let rimCol = RIM_ON;
const PART_COL = [T, rgb(255, 250, 200), rgb(255, 170, 60), rgb(200, 70, 40), rgb(222, 236, 246), rgb(120, 150, 172), rgb(150, 150, 152), rgb(96, 96, 102), rgb(255, 255, 240)];
const HOLE = rgb(8, 8, 12), CRACK = rgb(226, 232, 240);

// pose = [hand x, hand y, bat angle, hand-to-tip length]
const makeKeys = () => {
  IX1 = GCX + 14; IY1 = GCY - 10; IX2 = IX1 - 24; IY2 = IY1 + 16;
  const REST = [268, REST_HY, -1.3, 170];
  const UP = [240, 330, -2.02, 250];
  const hitPose = (ix, iy) => { const hx = ix - 25, hy = iy + 165; return [hx, hy, Math.atan2(iy - hy, ix - hx), Math.hypot(ix - hx, iy - hy)]; };
  const recoil = (p) => [p[0] + 6, p[1] + 14, p[2] - .08, p[3] - 12];
  const H1 = hitPose(IX1, IY1), H2 = hitPose(IX2, IY2);
  // [frame, pose, 1 = swing (accelerating)]
  KEYS = [[0, REST, 0], [20, REST, 0], [26, UP, 0], [HIT1, H1, 1], [31, recoil(H1), 0], [38, UP, 0], [40, UP, 0],
    [HIT2, H2, 1], [45, recoil(H2), 0], [58, REST, 0], [80, REST, 0]];
};
const poseAt = (s) => {
  const last = KEYS.length;
  for (let k = 1; k < last; k++) {
    const a = KEYS[k - 1], b = KEYS[k];
    if (s <= b[0]) {
      let q = clamp((s - a[0]) / (b[0] - a[0]));
      q = b[2] ? q * q : q * q * (3 - 2 * q);
      return a[1].map((v, j) => v + (b[1][j] - v) * q);
    }
  }
  return KEYS[last - 1][1];
};
const riseAt = (s) => (1 - smooth(0, 12, s)) * 260;
const batPose = (s) => { const p = poseAt(s), r = riseAt(s); return [p[0], p[1] + r, Math.cos(p[2]), Math.sin(p[2]), p[3]]; };

let segH = 0;
const segD = (x, y, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const h = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1));
  segH = h;
  return Math.hypot(x - ax - dx * h, y - ay - dy * h);
};
const inEll = (x, y, c, rx, ry) => { const u = (x - c[0]) / rx, v = (y - c[1]) / ry; return u * u + v * v < 1; };
const elbow = (a, b, ox, oy) => {
  let nx = -(b[1] - a[1]), ny = b[0] - a[0];
  const m = Math.hypot(nx, ny) || 1;
  nx /= m; ny /= m;
  if (nx * ox + ny * oy < 0) { nx = -nx; ny = -ny; }
  return [(a[0] + b[0]) / 2 + nx * 30, (a[1] + b[1]) / 2 + ny * 30];
};
const joints = (s) => {
  const B = batPose(s), p = poseAt(s), rise = riseAt(s);
  const lean = REST_HY - p[1];
  const lx = lean * .08, ly = -lean * .1 + rise;
  const hr = [B[0], B[1]], hl = [B[0] - B[2] * 24, B[1] - B[3] * 24];
  const sr = [285 + lx * .5, 485 + ly], sl = [70 + lx * .5, 490 + ly];
  return { B, hr, hl, sr, sl, er: elbow(sr, hr, 1, .2), el: elbow(sl, hl, -.3, 1),
    head: [170 + lx, 392 + ly], neck: [170 + lx * .6, 445 + ly], torso: [175, 565 + ly] };
};
// seen from behind: hood, shoulders, both arms up to the grip
const bodyIn = (x, y) => {
  if (inEll(x, y, J.head, 46, 52) || inEll(x, y, J.neck, 38, 36) || inEll(x, y, J.torso, 172, 125)) return true;
  if (inEll(x, y, J.sr, 42, 36) || inEll(x, y, J.sl, 42, 36)) return true;
  if (segD(x, y, J.sr[0], J.sr[1], J.er[0], J.er[1]) < 21 || segD(x, y, J.er[0], J.er[1], J.hr[0], J.hr[1]) < 17) return true;
  if (segD(x, y, J.sl[0], J.sl[1], J.el[0], J.el[1]) < 21 || segD(x, y, J.el[0], J.el[1], J.hl[0], J.hl[1]) < 17) return true;
  return Math.hypot(x - J.hr[0], y - J.hr[1]) < 14 || Math.hypot(x - J.hl[0], y - J.hl[1]) < 14;
};
// wooden bat: taped grip, knob, barrel widening toward the tip, lit on one side
const batAt = (x, y, B) => {
  const kx = B[0] - B[2] * 34, ky = B[1] - B[3] * 34, tx = B[0] + B[2] * B[4], ty = B[1] + B[3] * B[4];
  const d = segD(x, y, kx, ky, tx, ty), h = segH;
  const r = 4.5 + 6.5 * smooth(.45, .85, h);
  const knob = Math.hypot(x - kx, y - ky) < 7;
  if (d >= r && !knob) return 0;
  if (h < .3 || knob) return 9;
  const side = ((x - kx) * B[3] - (y - ky) * B[2]) / r;
  return side < -.35 ? 3 : side < .45 ? 4 : 5;
};
const buildFigure = (s) => {
  J = joints(s);
  const bats = [J.B];
  if ((s > 26 && s <= HIT1) || (s > 40 && s <= HIT2)) bats.push(batPose(s - .4), batPose(s - .8));
  let minY = Math.min(J.head[1] - 60, J.hr[1] - 40);
  bats.forEach((B) => { minY = Math.min(minY, B[1] + B[3] * B[4], B[1] - B[3] * 34); });
  const by0 = clamp(Math.floor(minY / 2) - 8, 1, FW);
  fig.fill(0);
  const nb = bats.length;
  for (let by = by0; by < FW; by++) for (let bx = 0; bx < FW; bx++) {
    const x = bx * 2 + 1, y = by * 2 + 1;
    let c = 0;
    if (bodyIn(x, y)) c = bodyIn(x + 7, y - 7) ? 1 : 2;
    else c = batAt(x, y, J.B);
    if (!c) for (let g = 1; g < nb; g++) if (batAt(x, y, bats[g])) { c = 6; break; }
    fig[by * FW + bx] = c;
  }
  // ink outline around the whole figure
  const lastRow = FW - 1;
  for (let by = by0 - 1; by < lastRow; by++) for (let bx = 1; bx < lastRow; bx++) {
    const i = by * FW + bx;
    if (fig[i]) continue;
    const a = fig[i - 1], b = fig[i + 1], c = fig[i - FW], d = fig[i + FW];
    if ((a && a !== 7) || (b && b !== 7) || (c && c !== 7) || (d && d !== 7)) fig[i] = 7;
  }
};

// ---------- debris ----------
const pp = (x, y, c) => { const bx = Math.floor(x / 2), by = Math.floor(y / 2); if (bx >= 0 && by >= 0 && bx < FW && by < FW) part[by * FW + bx] = c; };
const blob = (x, y, r, c, density) => {
  const bx0 = Math.floor((x - r) / 2), bx1 = Math.ceil((x + r) / 2), by0 = Math.floor((y - r) / 2), by1 = Math.ceil((y + r) / 2);
  for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
    if (bx < 0 || by < 0 || bx >= FW || by >= FW) continue;
    if (Math.hypot(bx * 2 + 1 - x, by * 2 + 1 - y) < r && (BAYER[by & 3][bx & 3] + .5) / 16 < density) part[by * FW + bx] = c;
  }
};
const burst = (ix, iy, sh, seed) => {
  const dt = smashS - sh;
  if (dt < 0) return;
  // glass shards: pop out, tumble, land on the desk
  for (let i = 0; i < 12; i++) {
    const hs = i + seed * 70;
    const vx = (hash(hs) - .5) * 16, vy = -4 - hash(hs + 3) * 10, floorY = DESK_Y + 8 + hash(hs + 6) * 50;
    let x = ix + vx * dt, y = iy + vy * dt + 1.8 * dt * dt, landed = false;
    if (y > floorY) {
      const tl = (-vy + Math.sqrt(vy * vy + 7.2 * (floorY - iy))) / 3.6;
      x = ix + vx * tl; y = floorY; landed = true;
    }
    const c = landed ? 5 : (dt + i) % 3 ? 5 : 4;
    pp(x, y, c); pp(x + 2, y, landed ? 4 : c);
  }
  // sparks
  if (dt < 11) for (let i = 0; i < 26; i++) {
    const hs = i + seed * 50;
    const a = hash(hs) * Math.PI * 2, v = 10 + hash(hs + 9) * 20;
    const c = dt < 3 ? 1 : dt < 7 ? 2 : 3;
    const t1 = dt, t0 = dt - .5;
    const x = ix + Math.cos(a) * v * t1, y = iy + Math.sin(a) * v * t1 + 2.5 * t1 * t1;
    pp(x, y, c); pp(x + 2, y, c); pp(x, y + 2, c); pp(x + 2, y + 2, c);
    if (t0 > 0) pp(ix + Math.cos(a) * v * t0, iy + Math.sin(a) * v * t0 + 2.5 * t0 * t0, c);
  }
  // impact flash
  if (dt < 2) {
    const L = dt ? 34 : 64;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + .2;
      for (let r = 0; r < L; r += 2) pp(ix + Math.cos(a) * r, iy + Math.sin(a) * r, 8);
    }
    blob(ix, iy, dt ? 8 : 16, 8, 1);
  }
};
const smoke = () => {
  for (let i = 0; i < 7; i++) {
    const age = smashS - HIT2 - 4 - i * 4;
    if (age < 0 || age > 26) continue;
    blob(IX2 + Math.sin(age * .25 + i) * 6 + age * 1.2, IY2 - age * 3.5, 5 + age * .7, age < 8 ? 6 : 7, 1 - age / 30);
  }
};

// ---------- cracked glass ----------
const crackAt = (dx, dy, seed, R, hr) => {
  const d = Math.hypot(dx, dy);
  if (d > R) return 0;
  const a = Math.atan2(dy, dx);
  const bucket = Math.floor((a + Math.PI) / (Math.PI * 2) * 16);
  const hole = hr * (.7 + .6 * hash(bucket + seed * 31));
  if (d < hole) return 2;
  if (d < hole + 1.5) return 1;
  for (let k = 0; k < 9; k++) {
    const th = k / 9 * Math.PI * 2 + hash(k + seed * 7) * .6 + Math.sin(d * .09 + k) * .07;
    const L = R * (.45 + .55 * hash(k + seed * 13));
    if (d > L) continue;
    const da = a - th;
    if (Math.cos(da) > 0 && Math.abs(Math.sin(da)) * d < 1.1) return 1;
  }
  for (let r = 0; r < 2; r++) {
    const Rr = R * (.28 + r * .26) * (1 + .06 * Math.sin(a * 7 + seed));
    if (Math.abs(d - Rr) < .9 && hash(bucket * 3 + r + seed * 5) > .35) return 1;
  }
  return 0;
};
const glassAt = (qx, qy, i) => {
  if (smashS >= HIT1) {
    let c = crackAt(qx - IX1, qy - IY1, 1, 85, 10);
    if (smashS >= HIT2 && c < 2) c = Math.max(c, crackAt(qx - IX2, qy - IY2, 2, 120, 24));
    if (c === 2) return HOLE;
    if (c === 1) return CRACK;
  }
  return tube(su[i], sv[i]);
};

// what the tube shows while it gets hit
const smashScreen = (s) => {
  if (s < HIT1) { drawA(s + 1); resolve(PAL_A); }
  else if (s === HIT1) fillScreen(255, 255, 255);
  else if (s < HIT1 + 4) { drawA(s + 1); resolve(PAL_A); tear(s); }
  else if (s < HIT1 + 6) { drawA(s + 1); resolve(PAL_A); squash(s - HIT1 - 4); }
  else if (s === HIT2) fillScreen(120, 150, 220);
  else {
    fillScreen(6, 8, 10);
    if (s === HIT1 + 6) for (let y = 23; y < 25; y++) for (let x = 31; x < 33; x++) setPx(x, y, 255, 255, 255);
  }
};
const smashFrame = (s) => {
  smashS = s;
  smashScreen(s);
  const d1 = s - HIT1, d2 = s - HIT2;
  if (d1 >= 0 && d1 < 4) { shX += SHK_X[d1]; shY += SHK_Y[d1]; }
  if (d2 >= 0 && d2 < 4) { shX += Math.round(SHK_X[d2] * 1.5); shY += Math.round(SHK_Y[d2] * 1.5); }
  rimCol = s === HIT1 || s === HIT2 ? RIM_FLASH : s < HIT1 ? RIM_ON : RIM_OFF;
  buildFigure(s);
  part.fill(0);
  if (s >= HIT2 + 4) smoke();
  burst(IX1, IY1, HIT1, 1);
  burst(IX2, IY2, HIT2, 2);
};

let frameT = -1;
const render = (t) => {
  if (!KEYS) makeKeys();
  const lt = ((t % TOTAL) + TOTAL) % TOTAL;
  curT = lt; smashS = -1; shX = 0; shY = 0;
  if (lt >= SMASH0) { smashFrame(lt - SMASH0); frameT = t; return; }
  const slot = Math.floor(lt / SLOT), f = lt % SLOT;
  const cur = CHANNELS[slot], next = CHANNELS[(slot + 1) % CHANNELS.length];
  if (f < SHOW) { cur.draw(cur.t0 + f); resolve(cur.pal); }
  else channel(f - SHOW, cur.draw, cur.t0 + SHOW - 1, cur.pal, next.draw, next.t0, next.pal);
  frameT = t;
};

// sample the tube: rounded corners, scanlines, falloff at the edges, a glare streak across the glass
const tube = (u, v) => {
  const ex = Math.abs(u - .5) * 2, ey = Math.abs(v - .5) * 2;
  const corner = Math.hypot(Math.max(ex - .82, 0) / .18, Math.max(ey - .78, 0) / .20);
  if (corner > 1) return rgb(14, 16, 18);
  const sx = clamp(Math.floor(u * SW), 0, SW - 1), sy2 = clamp(Math.floor(v * SH), 0, SH - 1);
  const j = (sy2 * SW + sx) * 3;
  const scan = sy2 & 1 ? .86 : 1;
  const vig = (1 - .45 * smooth(.7, 1.05, Math.max(ex, ey * .95))) * scan;
  const glare = smooth(.16, .2, u * .7 + v) * (1 - smooth(.27, .33, u * .7 + v)) * .16;
  const r = Math.round(clamp((px[j] * vig) / 255 + glare) * 255);
  const g = Math.round(clamp((px[j + 1] * vig) / 255 + glare) * 255);
  const b = Math.round(clamp((px[j + 2] * vig) / 255 + glare) * 255);
  return rgb(r, g, b);
};

out(fn((x, y, t) => {
  if (!baked) bake();
  if (t !== frameT) render(t);
  if (smashS >= 0) {
    const b = (y >> 1) * FW + (x >> 1);
    const f = fig[b];
    if (f) return f === 2 ? rimCol : FIG_COL[f];
    const p = part[b];
    if (p) return PART_COL[p];
  }
  const qx = x - shX, qy = y - shY;
  if (qx < 0 || qy < 0 || qx >= N || qy >= N) return T;
  const i = qy * N + qx;
  switch (kind[i]) {
    case 1: return BODY[tone[i]];
    case 2: return glassAt(qx, qy, i);
    case 3: return SHADOW;
    case 4: return INK;
    default: return T;
  }
}));
`,
  },
  {
    id: 'taj-mahal',
    name: 'Taj Mahal - Golden Hour',
    teaches: 'Isometric at 512: a depth buffer and a sun shadow map, baked once',
    code: `// Taj Mahal at golden hour: isometric and fully procedural, 512x512.
// Every surface is sampled once into a depth buffer and a sun shadow map, then
// lit. Only the sky, clouds, birds and the pool water move, frame by frame.
size(512, 512); fps(12); cycle(192);

const W = 512, H = 512, N = W * H, TAU = Math.PI * 2;
// Projection: a world metre is A px along each ground axis, Z px upward.
const CX = 186, CY = 280, A = 1.75, Z = 2.5, C = A / Z;

// ---------- sun, and the shadow map's basis ----------
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const L = nrm([0.7, 0.4, 0.62]);
const E1 = nrm([-L[1], L[0], 0]);
const E2 = [L[1] * E1[2] - L[2] * E1[1], L[2] * E1[0] - L[0] * E1[2], L[0] * E1[1] - L[1] * E1[0]];
const SC = 0.4, SN = 1100, SO = 550;
const smap = new Float32Array(SN * SN).fill(-1e9);

// ---------- the G-buffer ----------
const zb = new Float32Array(N).fill(-1e9);
const PX = new Float32Array(N), PY = new Float32Array(N), PZ = new Float32Array(N);
const NX = new Float32Array(N), NY = new Float32Array(N), NZ = new Float32Array(N);
const AR = new Float32Array(N), AG = new Float32Array(N), AB = new Float32Array(N);
const KIND = new Uint8Array(N);      // 0 sky, 1 surface, 2 water

// A paint call writes its albedo here: cr, cg, cb, and ck (1 surface, 2 water).
let cr = 0, cg = 0, cb = 0, ck = 1;
const set = (c, k = 1) => { cr = c[0] * k; cg = c[1] * k; cb = c[2] * k; ck = 1; };

const emit = (x, y, z, nx, ny, nz, paint, f, a, b) => {
  const gi = Math.floor((x * E1[0] + y * E1[1] + z * E1[2]) / SC) + SO;
  const gj = Math.floor((x * E2[0] + y * E2[1] + z * E2[2]) / SC) + SO;
  if (gi >= 0 && gi < SN && gj >= 0 && gj < SN) {
    const k = gj * SN + gi, dl = x * L[0] + y * L[1] + z * L[2];
    if (dl > smap[k]) smap[k] = dl;
  }
  const sx = Math.floor(CX + (x - y) * A), sy = Math.floor(CY + (x + y) * A / 2 - z * Z);
  if (sx < 0 || sx >= W || sy < 0 || sy >= H) return;
  const i = sy * W + sx, d = x + y + C * z;
  if (d <= zb[i]) return;
  zb[i] = d; PX[i] = x; PY[i] = y; PZ[i] = z; NX[i] = nx; NY[i] = ny; NZ[i] = nz;
  paint(f, a, b);
  AR[i] = cr; AG[i] = cg; AB[i] = cb; KIND[i] = ck;
};

// ---------- primitives ----------
const ST = 0.18;   // sample spacing in metres: under half a pixel on screen

// A flat rectangle: origin, two unit edge directions with lengths, a normal.
const quad = (o, u, lu, v, lv, n, paint, f) => {
  for (let a = 0; a <= lu; a += ST) for (let b = 0; b <= lv; b += ST)
    emit(o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b, n[0], n[1], n[2], paint, f, a, b);
};

// The three faces of a box the camera (and the sun) can see.
const box = (x0, y0, z0, w, d, h, paint) => {
  quad([x0, y0, z0 + h], [1, 0, 0], w, [0, 1, 0], d, [0, 0, 1], paint, 't');
  quad([x0 + w, y0, z0], [0, 1, 0], d, [0, 0, 1], h, [1, 0, 0], paint, 'x');
  quad([x0, y0 + d, z0], [1, 0, 0], w, [0, 0, 1], h, [0, 1, 0], paint, 'y');
};

// A surface of revolution: radius rf(h) for h in [0, hgt]. paint gets ('s', angle, h).
const rev = (cx, cy, z0, hgt, rf, paint) => {
  let h = 0;
  while (h <= hgt) {
    const r = rf(h);
    const dr = (rf(Math.min(hgt, h + 0.03)) - rf(Math.max(0, h - 0.03))) / 0.06;
    const n = Math.max(8, Math.ceil(TAU * Math.max(r, 0.05) / ST));
    const nl = Math.hypot(1, dr);
    for (let k = 0; k < n; k++) {
      const th = (k / n) * TAU, c = Math.cos(th), s = Math.sin(th);
      emit(cx + r * c, cy + r * s, z0 + h, c / nl, s / nl, -dr / nl, paint, 's', th, h);
    }
    h += ST / Math.max(1, Math.abs(dr));
  }
};

// A flat ring or disc facing up. paint gets ('t', radius, angle).
const disc = (cx, cy, z, r0, r1, paint) => {
  for (let r = r0; r <= r1; r += ST) {
    const n = Math.max(8, Math.ceil(TAU * Math.max(r, 0.05) / ST));
    for (let k = 0; k < n; k++) {
      const th = (k / n) * TAU;
      emit(cx + r * Math.cos(th), cy + r * Math.sin(th), z, 0, 0, 1, paint, 't', r, th);
    }
  }
};

// ---------- palette (albedo) ----------
const MARBLE = [0.94, 0.92, 0.88];
const INLAY = [0.36, 0.32, 0.32];
const GOLD = [1.0, 0.78, 0.36];
const SAND = [0.74, 0.40, 0.29];
const SAND_L = [0.82, 0.58, 0.44];
const LAWN = [0.30, 0.47, 0.20];
const CYPRESS = [0.13, 0.28, 0.16];
const LEAF = [0.24, 0.42, 0.18];
const BARK = [0.32, 0.22, 0.16];
const FLOWER = [0.86, 0.42, 0.50];
const EARTH = [0.42, 0.28, 0.20];

const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// Inside a two-centred pointed arch of half-width w with its springline at s.
const inArch = (du, h, w, s) => {
  du = Math.abs(du);
  if (du > w || h < 0) return false;
  if (h <= s) return true;
  const R = w * 1.55, o = R - w;
  return (du + o) * (du + o) + (h - s) * (h - s) <= R * R;
};

// An arched bay: inlaid outline, shaded recess, and a dark door at the foot.
const bay = (du, h, w, s, base) => {
  const hb = h - base;
  if (hb < 0) return false;
  if (inArch(du, hb, w, s)) {
    if (Math.abs(du) < w * 0.55 && hb < s * 0.8) set(INLAY, 0.55);
    else set(MARBLE, 0.5 + 0.2 * Math.min(1, hb / (s * 1.6)));
    return true;
  }
  if (inArch(du, hb, w + 0.45, s + 0.2)) { set(INLAY, 1.4); return true; }
  return false;
};

// ---------- the ground and the diorama it sits on ----------
const GX0 = -52, GX1 = 128, GY0 = -52, GY1 = 52;
const GE = 120, XM = 90;   // where the lawns end, and the cross axis

const groundPaint = (x, y) => {
  const ay = Math.abs(y);
  if (x < 56 || ay > 48 || x > GE + 4) {                          // sandstone terrace
    const tile = (Math.floor(x / 3) + Math.floor(y / 3)) & 1;
    set(tile ? SAND : SAND_L, x % 3 < 0.25 || y % 3 < 0.25 ? 0.85 : 1);
    return;
  }
  if (ay <= 2.6 || (Math.abs(x - XM) <= 1.8 && ay > 6.5 && ay < 44)) { set([0, 0, 0]); ck = 2; return; }
  if (ay <= 3.2) { set(MARBLE); return; }                       // pool kerb
  if (ay <= 6.5 || Math.abs(x - XM) <= 4 || ay >= 44 || x < 60 || x > GE) { set(SAND_L); return; }
  // lawn quarters, mown in stripes, with a flower border round each
  const ex = Math.min(x - 60, Math.abs(x - XM) - 4, GE - x);
  const ey = Math.min(ay - 6.5, 44 - ay);
  if (Math.min(ex, ey) < 1.2) { set(hash(Math.floor(x * 2), Math.floor(y * 2)) > 0.45 ? FLOWER : LEAF); return; }
  set(LAWN, Math.floor(x / 2.4) & 1 ? 1 : 0.9);
};

const slabPaint = (f, a, b) => set(b > 9.4 ? SAND : EARTH, b > 9.4 ? 0.9 : 0.8 + 0.12 * (Math.floor(b * 1.5) & 1));
quad([GX1, GY0, -10], [0, 1, 0], GY1 - GY0, [0, 0, 1], 10, [1, 0, 0], slabPaint, 'x');
quad([GX0, GY1, -10], [1, 0, 0], GX1 - GX0, [0, 0, 1], 10, [0, 1, 0], slabPaint, 'y');

// ---------- the plinth ----------
box(-48, -48, 0, 96, 96, 7, (f, a, b) => {
  if (f === 't') {
    const edge = a < 1 || b < 1 || a > 95 || b > 95;
    set(MARBLE, edge ? 0.86 : (Math.floor(a / 4) + Math.floor(b / 4)) & 1 ? 1 : 0.95);
    return;
  }
  if (b > 6.3) { set(MARBLE); return; }
  if (bay((a % 4) - 2, b, 1.3, 2.4, 1.2)) return;
  set(MARBLE, 0.97);
});

// ---------- the mausoleum: a chamfered square, 57 m across ----------
const HB = 28.5, SB = 46, K = SB - HB, Z0 = 7, HT = 33;

const facePaint = (u, h, main) => {
  if (h > HT - 1.6) { set(MARBLE, h > HT - 0.6 && (u + 40) % 1.6 < 0.6 ? 0.8 : 1.04); return; }
  if (h > HT - 2) { set(INLAY, 1.3); return; }
  if (main) {
    const au = Math.abs(u);
    if (au < 10.4) {
      if (au > 10 || (h > 29.8 && h < 30.2)) { set(INLAY, 1.3); return; }
      if (h > 30.2) { set(MARBLE); return; }
      if ((au > 8.6 && au < 9) || (h > 28.2 && h < 28.6 && au < 9)) { set(INLAY); return; }
      if (inArch(u, h, 7.6, 16)) {                              // the great iwan
        if (bay(u, h, 3.2, 6, 0.8) || bay(u, h, 2.4, 3.5, 13)) return;
        set(MARBLE, 0.48 + 0.18 * Math.min(1, h / 26));
        return;
      }
      if (inArch(u, h, 8.1, 16.3)) { set(INLAY, 1.4); return; }
      set(MARBLE); return;
    }
    if (au > 10.8 && au < 11.1) { set(INLAY, 1.3); return; }
    const uc = Math.sign(u) * 14.4;
    if (bay(u - uc, h, 2.5, 7.5, 1.5) || bay(u - uc, h, 2.5, 7.5, 16.5)) return;
    set(MARBLE); return;
  }
  if (bay(u, h, 4, 7.5, 1.5) || bay(u, h, 4, 7.5, 16.5)) return;
  set(MARBLE);
};

quad([HB, -K, Z0], [0, 1, 0], 2 * K, [0, 0, 1], HT, [1, 0, 0], (f, a, b) => facePaint(a - K, b, true), 'x');
quad([-K, HB, Z0], [1, 0, 0], 2 * K, [0, 0, 1], HT, [0, 1, 0], (f, a, b) => facePaint(a - K, b, true), 'y');
const R2 = Math.SQRT1_2, CH = (HB - K) * Math.SQRT2;
quad([HB, K, Z0], [-R2, R2, 0], CH, [0, 0, 1], HT, [R2, R2, 0], (f, a, b) => facePaint(a - CH / 2, b, false), 'c');
// the two side chamfers, edge on to the camera but they cast shadow
quad([HB, -K, Z0], [-R2, -R2, 0], CH, [0, 0, 1], HT, [R2, -R2, 0], (f, a, b) => facePaint(a - CH / 2, b, false), 'c');
quad([-K, HB, Z0], [-R2, -R2, 0], CH, [0, 0, 1], HT, [-R2, R2, 0], (f, a, b) => facePaint(a - CH / 2, b, false), 'c');
for (let x = -HB; x <= HB; x += ST) for (let y = -HB; y <= HB; y += ST) {
  if (Math.abs(x) + Math.abs(y) > SB) continue;
  emit(x, y, Z0 + HT, 0, 0, 1, () => set(MARBLE, 0.97), 't', 0, 0);
}

// slender pinnacles at the eight corners of the octagon
const pinnacle = (px, py) => rev(px, py, Z0, HT + 6.5, (h) => (h > HT + 5 ? 0.9 * Math.sqrt(Math.max(0, (HT + 6.5 - h) / 1.5)) : h > HT + 4 ? 1.1 : 0.75),
  (f, th, h) => set(h > HT + 5.8 ? GOLD : MARBLE, h > HT + 4 && h < HT + 5 ? 0.85 : 1));
for (const [px, py] of [[HB, K], [HB, -K], [K, HB], [-K, HB], [-HB, K], [-HB, -K], [K, -HB], [-K, -HB]]) pinnacle(px, py);

// ---------- onion domes ----------
// The classic profile: a waist where it meets the drum, a full bulb, a pinched tip.
const onion = (rb, hd) => (h) => {
  const s = h / hd;
  if (s < 0.3) return rb * (0.87 + 0.13 * Math.sin((Math.PI / 2) * (s / 0.3)));
  const q = (s - 0.3) / 0.7;
  return rb * Math.pow(Math.max(0, Math.cos((q * Math.PI) / 2)), 1.5) * (1 - 0.15 * q * q);
};
const domePaint = (hd, n) => (f, th, h) => {
  const s = h / hd;
  const petal = Math.abs(((th / TAU) * n) % 1 - 0.5);
  if (s < 0.08) { set(MARBLE, 0.9); return; }
  if (s < 0.14 && petal * 0.12 > s - 0.08) { set(INLAY, 1.6); return; }
  if (s > 0.86 && petal * 0.3 < s - 0.86) { set(MARBLE, 0.88); return; }
  set(MARBLE, 1.02);
};
const finial = (cx, cy, z, k) => rev(cx, cy, z, 7 * k, (h) => {
  const s = h / k;
  if (s < 1) return 0.9 * k;
  if (s < 2.4) return k * (0.35 + 0.7 * Math.sin(Math.PI * (s - 1) / 1.4));
  if (s < 3.4) return k * 0.3;
  if (s < 4.4) return k * (0.3 + 0.45 * Math.sin(Math.PI * (s - 3.4)));
  return k * 0.18 * (1 - (s - 4.4) / 2.6);
}, () => set(GOLD));

// the great dome, on its drum
const ZD = Z0 + HT;
rev(0, 0, ZD, 14, () => 13.5, (f, th, h) => {
  if (h < 1 || h > 13) { set(MARBLE, 0.92); return; }
  const du = (((th / TAU) * 18) % 1 - 0.5) * (TAU * 13.5 / 18);
  if (bay(du, h, 1.4, 6, 2.5)) return;
  set(MARBLE);
});
rev(0, 0, ZD + 14, 36, onion(15.5, 36), domePaint(36, 16));
finial(0, 0, ZD + 49.5, 1.2);

// four chhatris (domed kiosks) on the roof
const chhatri = (x, y, z, r) => {
  disc(x, y, z + 0.8, 0, r + 0.6, () => set(MARBLE, 0.95));
  rev(x, y, z, 0.8, () => r + 0.6, () => set(MARBLE, 0.9));
  rev(x, y, z + 0.8, 1.5 * r, () => r, (f, th, h) => {
    const du = (((th / TAU) * 8) % 1 - 0.5) * (TAU * r / 8);
    if (h < 1.4 * r && inArch(du, h - 0.2 * r, 0.32 * r, 0.6 * r)) { set(INLAY, 0.5); return; }
    set(MARBLE);
  });
  rev(x, y, z + 0.8 + 1.5 * r, 0.3, () => r + 0.4, () => set(MARBLE, 0.9));
  rev(x, y, z + 1.1 + 1.5 * r, 1.6 * r, onion(r * 1.05, 1.6 * r), domePaint(1.6 * r, 8));
  finial(x, y, z + 1.1 + 3.1 * r, 0.3 * r);
};
for (const [x, y] of [[-19, -19], [19, -19], [-19, 19], [19, 19]]) chhatri(x, y, ZD, 4);

// ---------- four minarets, one at each corner of the plinth ----------
const minaret = (x, y) => {
  const hs = 37;
  rev(x, y, Z0, hs, (h) => 2.7 - 0.6 * (h / hs), (f, th, h) => {
    const ring = h % 12.3 < 0.25;
    const joint = Math.abs(((th / TAU) * 12) % 1 - 0.5) < 0.04;
    set(ring || joint ? INLAY : MARBLE, ring || joint ? 1.8 : 1);
  });
  for (const hb of [12.3, 24.6, 37]) {                             // balconies
    rev(x, y, Z0 + hb - 1.2, 1.2, (h) => 2.7 - 0.6 * (hb / hs) + 1.2 * (h / 1.2), () => set(MARBLE, 0.8));
    disc(x, y, Z0 + hb, 0, 3.9 - 0.6 * (hb / hs), (f, r) => set(MARBLE, r > 3.4 - 0.6 * (hb / hs) ? 1 : 0.92));
  }
  chhatri(x, y, Z0 + hs, 2.2);
};
for (const [x, y] of [[-44, -44], [44, -44], [-44, 44], [44, 44]]) minaret(x, y);

// ---------- the garden: cypress avenues and shade trees ----------
const cypress = (x, y) => rev(x, y, 0, 7.5, (h) => (h < 0.5 ? 0.25 : 1.5 * Math.pow(Math.sin(Math.PI * Math.pow((h - 0.5) / 7, 0.75)), 0.9)),
  (f, th, h) => set(h < 0.5 ? BARK : CYPRESS, 0.85 + 0.3 * hash(Math.floor(th * 4), Math.floor(h * 2.5))));
const tree = (x, y) => rev(x, y, 0, 8, (h) => (h < 2 ? 0.35 : Math.sqrt(Math.max(0, 9 - (h - 5) * (h - 5)))),
  (f, th, h) => set(h < 2 ? BARK : LEAF, 0.8 + 0.4 * hash(Math.floor(th * 5), Math.floor(h * 2))));
for (let x = 62; x <= GE - 2; x += 7) {
  if (Math.abs(x - XM) < 6) continue;
  cypress(x, -9); cypress(x, 9);
}
for (let x = 63; x <= GE; x += 11) { tree(x, -46); tree(x, 46); }

// the marble tank where the two channels cross
box(XM - 6, -6, 0, 12, 12, 0.7, (f, a, b) => {
  if (f === 't' && Math.abs(a - 6) < 4 && Math.abs(b - 6) < 4) { set([0, 0, 0]); ck = 2; return; }
  set(MARBLE, f === 't' ? 1 : 0.9);
});

// ---------- light it all, once ----------
const SUN = [1.05, 0.84, 0.62], AMB = [0.50, 0.52, 0.78];
const SHD = new Float32Array(N);
const cl = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

const lit = (x, y, z) => {
  const s1 = x * E1[0] + y * E1[1] + z * E1[2], s2 = x * E2[0] + y * E2[1] + z * E2[2];
  const dl = x * L[0] + y * L[1] + z * L[2];
  const gi = Math.floor(s1 / SC) + SO, gj = Math.floor(s2 / SC) + SO;
  let sum = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const k = (gj + dj) * SN + gi + di;
    sum += smap[k] > dl + 1.6 ? 0 : 1;
  }
  return sum / 9;
};

const BAKED = new Array(N).fill(0);
for (let i = 0; i < N; i++) {
  if (zb[i] < -1e8) {                                   // nothing modelled: ground or sky
    const sx = (i % W) + 0.5, sy = Math.floor(i / W) + 0.5;
    const d = (sx - CX) / A, s = (2 * (sy - CY)) / A;
    const gx = (s + d) / 2, gy = (s - d) / 2;
    if (gx < GX0 || gx > GX1 || gy < GY0 || gy > GY1) continue;
    groundPaint(gx, gy);
    PX[i] = gx; PY[i] = gy; PZ[i] = 0; NX[i] = 0; NY[i] = 0; NZ[i] = 1;
    AR[i] = cr; AG[i] = cg; AB[i] = cb; KIND[i] = ck;
  }
  const sh = lit(PX[i], PY[i], PZ[i]);
  SHD[i] = sh;
  if (KIND[i] !== 1) continue;
  const lam = Math.max(0, NX[i] * L[0] + NY[i] * L[1] + NZ[i] * L[2]) * sh;
  const amb = 0.42 + 0.18 * NZ[i];
  BAKED[i] = rgb(cl(AR[i] * (AMB[0] * amb + SUN[0] * lam)), cl(AG[i] * (AMB[1] * amb + SUN[1] * lam)), cl(AB[i] * (AMB[2] * amb + SUN[2] * lam)));
}

// ---------- what moves ----------
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const SKY = [[0.11, 0.10, 0.27], [0.33, 0.25, 0.50], [0.86, 0.52, 0.48], [0.99, 0.79, 0.56]];
const skyAt = (y) => {
  const s = Math.min(0.999, Math.max(0, y / 440)) * 3, k = Math.floor(s);
  return mix(SKY[k], SKY[k + 1], s - k);
};
const BIRDS = [[0, 92], [40, 104], [26, 84], [330, 140], [360, 128]];

out(fn((x, y, t) => {
  for (const [b0, y0] of BIRDS) {                       // birds, flapping, crossing once a loop
    const bx = ((b0 + t * (640 / 192)) % 640) - 64;
    const dx = x - bx;
    if (Math.abs(dx) <= 3) {
      const up = (t + b0) % 6 < 3;
      const wy = y0 + 4 * Math.sin(TAU * (t / 192) + b0) - (up ? (3 - Math.abs(dx)) * 0.7 : -Math.abs(dx) * 0.3);
      if (Math.abs(y - Math.round(wy)) < 0.6) return rgb(40, 28, 48);
    }
  }
  const i = y * W + x;
  const k = KIND[i];
  if (k === 1) return BAKED[i];
  if (k === 2) {                                        // the pool: deep water, sky and sun glints
    const wx = PX[i], wy = PY[i];
    const c = mix([0.07, 0.15, 0.27], skyAt(80 + (y % 40)), 0.45);
    const g = Math.sin(wx * 1.3 + TAU * t / 24) * Math.sin(wy * 2.4 - TAU * t / 32 + wx * 0.4);
    const sh = 0.55 + 0.45 * SHD[i];
    const glint = g > 0.82 ? 0.9 : g > 0.6 ? 0.35 : 0;
    const out3 = mix(c, [1.0, 0.86, 0.62], glint * SHD[i]);
    return rgb(cl(out3[0] * sh), cl(out3[1] * sh), cl(out3[2] * sh));
  }
  // sky, with a sun glow and long clouds drifting one screen width per loop
  let c = skyAt(y);
  const sd = Math.hypot(x - 470, y - 60);
  c = mix(c, [1.0, 0.86, 0.6], Math.exp(-sd * sd / 9000) * 0.8);
  const xp = x + t * (512 / 192);
  const band = Math.exp(-((y - 130) * (y - 130)) / 1800);
  const cloud = Math.sin(TAU * (2 * xp / 512) + 1.4 * Math.sin(TAU * (3 * xp / 512) + y * 0.09)) * 0.5 + 0.5;
  const dens = Math.max(0, cloud * band - 0.35) * 1.8;
  if (dens > 0) c = mix(c, mix([0.98, 0.70, 0.62], [0.55, 0.40, 0.62], Math.min(1, (y - 100) / -60 + 0.5)), Math.min(0.85, dens));
  return rgb(cl(c[0]), cl(c[1]), cl(c[2]));
}));
`,
  },
  {
    id: 'white-house',
    name: 'White House - South Lawn',
    teaches: 'The same iso engine at 128: one pixel per metre',
    code: `// The White House from the South Lawn: isometric and fully procedural, 128x128.
// Every surface is sampled once into a depth buffer and a sun shadow map, then
// lit. The flag, the fountain, the clouds and a pair of birds move per frame.
size(128, 128); fps(12); cycle(96);

const W = 128, H = 128, N = W * H, TAU = Math.PI * 2;
// Projection: a world metre is A px along each ground axis, Z px upward.
const CX = 73, CY = 62, A = 1.0, Z = 1.35, C = A / Z;

// ---------- sun, and the shadow map's basis ----------
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const L = nrm([0.7, 0.45, 0.8]);
const E1 = nrm([-L[1], L[0], 0]);
const E2 = [L[1] * E1[2] - L[2] * E1[1], L[2] * E1[0] - L[0] * E1[2], L[0] * E1[1] - L[1] * E1[0]];
const SC = 0.6, SN = 300, SO = 150;
const smap = new Float32Array(SN * SN).fill(-1e9);

// ---------- the G-buffer ----------
const zb = new Float32Array(N).fill(-1e9);
const PX = new Float32Array(N), PY = new Float32Array(N), PZ = new Float32Array(N);
const NX = new Float32Array(N), NY = new Float32Array(N), NZ = new Float32Array(N);
const AR = new Float32Array(N), AG = new Float32Array(N), AB = new Float32Array(N);
const KIND = new Uint8Array(N);      // 0 sky, 1 surface, 2 water

let cr = 0, cg = 0, cb = 0, ck = 1;
const set = (c, k = 1) => { cr = c[0] * k; cg = c[1] * k; cb = c[2] * k; ck = 1; };

const emit = (x, y, z, nx, ny, nz, paint, f, a, b) => {
  const gi = Math.floor((x * E1[0] + y * E1[1] + z * E1[2]) / SC) + SO;
  const gj = Math.floor((x * E2[0] + y * E2[1] + z * E2[2]) / SC) + SO;
  if (gi >= 0 && gi < SN && gj >= 0 && gj < SN) {
    const k = gj * SN + gi, dl = x * L[0] + y * L[1] + z * L[2];
    if (dl > smap[k]) smap[k] = dl;
  }
  const sx = Math.floor(CX + (x - y) * A), sy = Math.floor(CY + (x + y) * A / 2 - z * Z);
  if (sx < 0 || sx >= W || sy < 0 || sy >= H) return;
  const i = sy * W + sx, d = x + y + C * z;
  if (d <= zb[i]) return;
  zb[i] = d; PX[i] = x; PY[i] = y; PZ[i] = z; NX[i] = nx; NY[i] = ny; NZ[i] = nz;
  paint(f, a, b);
  AR[i] = cr; AG[i] = cg; AB[i] = cb; KIND[i] = ck;
};

// ---------- primitives ----------
const ST = 0.3;   // sample spacing in metres: under half a pixel on screen

const quad = (o, u, lu, v, lv, n, paint, f) => {
  for (let a = 0; a <= lu; a += ST) for (let b = 0; b <= lv; b += ST)
    emit(o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b, n[0], n[1], n[2], paint, f, a, b);
};
const box = (x0, y0, z0, w, d, h, paint) => {
  quad([x0, y0, z0 + h], [1, 0, 0], w, [0, 1, 0], d, [0, 0, 1], paint, 't');
  quad([x0 + w, y0, z0], [0, 1, 0], d, [0, 0, 1], h, [1, 0, 0], paint, 'x');
  quad([x0, y0 + d, z0], [1, 0, 0], w, [0, 0, 1], h, [0, 1, 0], paint, 'y');
};
// front = true draws only the half toward +y: the portico's back half is inside the house.
const rev = (cx, cy, z0, hgt, rf, paint, front = false) => {
  let h = 0;
  while (h <= hgt) {
    const r = rf(h);
    const dr = (rf(Math.min(hgt, h + 0.03)) - rf(Math.max(0, h - 0.03))) / 0.06;
    const n = Math.max(8, Math.ceil(TAU * Math.max(r, 0.05) / ST));
    const nl = Math.hypot(1, dr);
    for (let k = 0; k < n; k++) {
      const th = (k / n) * TAU, c = Math.cos(th), s = Math.sin(th);
      if (front && s < 0) continue;
      emit(cx + r * c, cy + r * s, z0 + h, c / nl, s / nl, -dr / nl, paint, 's', th, h);
    }
    h += ST / Math.max(1, Math.abs(dr));
  }
};
const disc = (cx, cy, z, r0, r1, paint, front = false) => {
  for (let r = r0; r <= r1; r += ST) {
    const n = Math.max(8, Math.ceil(TAU * Math.max(r, 0.05) / ST));
    for (let k = 0; k < n; k++) {
      const th = (k / n) * TAU;
      if (front && Math.sin(th) < 0) continue;
      emit(cx + r * Math.cos(th), cy + r * Math.sin(th), z, 0, 0, 1, paint, 't', r, th);
    }
  }
};

// ---------- palette (albedo) ----------
const WHITE = [0.96, 0.95, 0.92];
const GLASS = [0.20, 0.25, 0.34];
const ROOF = [0.52, 0.54, 0.58];
const LAWN = [0.36, 0.58, 0.24];
const GRAVEL = [0.86, 0.82, 0.72];
const LEAF = [0.22, 0.44, 0.18];
const BARK = [0.34, 0.24, 0.16];
const FLOWER = [0.86, 0.22, 0.24];
const IRON = [0.10, 0.10, 0.12];
const EARTH = [0.45, 0.31, 0.21];

const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---------- the grounds and the diorama they sit on ----------
const GX0 = -32, GX1 = 32, GY0 = -16, GY1 = 38;
const FX = 0, FY = 29;   // the fountain

const groundPaint = (x, y) => {
  const fr = Math.hypot(x - FX, y - FY);
  if (fr < 4.4) { set(fr < 3.4 ? GRAVEL : hash(Math.floor(x * 2), Math.floor(y * 2)) > 0.4 ? FLOWER : LEAF); return; }
  const e = Math.hypot(x / 23, (y - 25) / 11);                  // the oval drive round the lawn
  if (Math.abs(e - 1) < 0.07 && y > 13) { set(GRAVEL); return; }
  if (y > 13 && y < 15.5 && Math.abs(x) < 26) { set(GRAVEL, 0.95); return; }   // the terrace walk
  set(LAWN, Math.floor((x + y) / 3) & 1 ? 1 : 0.9);
};

const slabPaint = (f, a, b) => set(b > 5.4 ? LAWN : EARTH, b > 5.4 ? 0.8 : 0.82 + 0.1 * (Math.floor(b * 2) & 1));
quad([GX1, GY0, -6], [0, 1, 0], GY1 - GY0, [0, 0, 1], 6, [1, 0, 0], slabPaint, 'x');
quad([GX0, GY1, -6], [1, 0, 0], GX1 - GX0, [0, 0, 1], 6, [0, 1, 0], slabPaint, 'y');

// the iron fence along the two front edges
const fence = (f, a, b) => set(b > 1.35 || a % 1.2 < 0.35 ? IRON : LAWN, b > 1.35 || a % 1.2 < 0.35 ? 1 : 0.95);
quad([GX1 - 0.3, GY0, 0], [0, 1, 0], GY1 - GY0, [0, 0, 1], 1.6, [1, 0, 0], fence, 'x');
quad([GX0, GY1 - 0.3, 0], [1, 0, 0], GX1 - GX0, [0, 0, 1], 1.6, [0, 1, 0], fence, 'y');

// ---------- the Executive Residence: 51 m by 26 m ----------
const BX = 25.5, BY = 13, HG = 4, HC = 16.5, HT = 18.7;

// One facade: a rusticated ground floor, two floors of tall windows, cornice, balustrade.
const facade = (a, b, len) => {
  if (b > HC + 1) { set(WHITE, (a % 0.9) < 0.45 ? 0.9 : 1.02); return; }      // balustrade
  if (b > HC) { set(WHITE, 1.05); return; }                                   // cornice
  if (b > HC - 0.4) { set(WHITE, 0.82); return; }                             // its shadow line
  const col = ((a - 1.5) % 3.4 + 3.4) % 3.4;
  const inCol = col < 1.4 && a > 1 && a < len - 1;
  if (b < HG) {
    if (inCol && b > 1.2 && b < 2.9) { set(GLASS); return; }
    set(WHITE, Math.floor(b) % 1 === 0 && (b % 1) < 0.25 ? 0.86 : 0.95);
    return;
  }
  if (b < HG + 0.5) { set(WHITE, 1.04); return; }                             // string course
  if (inCol && ((b > 5.6 && b < 9.4) || (b > 11.2 && b < 14.6))) { set(GLASS); return; }
  if (inCol && b > 9.4 && b < 10.2) { set(WHITE, 1.06); return; }             // pediments over the state floor
  set(WHITE);
};

quad([-BX, BY, 0], [1, 0, 0], 2 * BX, [0, 0, 1], HT, [0, 1, 0], (f, a, b) => facade(a, b, 2 * BX), 'y');
quad([BX, -BY, 0], [0, 1, 0], 2 * BY, [0, 0, 1], HT, [1, 0, 0], (f, a, b) => facade(a, b, 2 * BY), 'x');
for (let x = -BX; x <= BX; x += ST) for (let y = -BY; y <= BY; y += ST) {
  const edge = Math.abs(x) > BX - 0.6 || Math.abs(y) > BY - 0.6;
  emit(x, y, edge ? HT : HT - 0.4, 0, 0, 1, () => set(edge ? WHITE : ROOF), 't', 0, 0);
}
for (const [x, y] of [[-20, -6], [-12, 6], [12, 6], [20, -6]]) box(x, y, HT - 0.4, 1.4, 1.4, 2.6, () => set(WHITE, 0.92));

// ---------- the South Portico: a bowed wall behind six columns ----------
const PR = 6.5, CR = 8.6;
rev(0, BY, 0, HC, () => PR, (f, th, h) => {
  const s = (th / TAU) * 14;
  const win = Math.abs((s % 1) - 0.5) < 0.22;
  if (h < HG) { set(win && h > 1 && h < 3.2 ? GLASS : WHITE, win && h > 1 && h < 3.2 ? 1 : 0.95); return; }
  if (win && ((h > 5.6 && h < 9.4) || (h > 11.2 && h < 14.6))) { set(GLASS); return; }
  set(WHITE);
}, true);
// the ground-floor drum the columns stand on, with arched openings
rev(0, BY, 0, HG, () => CR + 0.7, (f, th, h) => {
  const s = (th / TAU) * 18;
  set(Math.abs((s % 1) - 0.5) < 0.25 && h > 0.6 && h < 3 ? GLASS : WHITE, 0.95);
}, true);
disc(0, BY, HG, 0, CR + 0.7, () => set(WHITE, 0.9), true);
for (let k = 0; k < 6; k++) {
  const th = (Math.PI * (k + 0.5)) / 6;
  rev(CR * Math.cos(th), BY + CR * Math.sin(th), HG, HC - HG, (h) => (h < 0.5 || h > HC - HG - 0.6 ? 0.6 : 0.45), () => set(WHITE, 1.04));
}
// the Truman balcony at the second floor
disc(0, BY, 10.2, PR, CR, () => set(WHITE, 0.95), true);
rev(0, BY, 10.2, 0.9, () => CR - 0.2, (f, th, h) => set(WHITE, (th * 40) % 1 < 0.5 ? 0.85 : 1), true);
// entablature, its roof, and the balustrade round it
rev(0, BY, HC, 1, () => CR + 0.6, () => set(WHITE, 1.05), true);
disc(0, BY, HC + 1, 0, CR + 0.6, () => set(ROOF, 1.05), true);
rev(0, BY, HC + 1, 1.1, () => CR + 0.4, (f, th) => set(WHITE, (th * 30) % 1 < 0.5 ? 0.9 : 1.02), true);

// the flagpole on the roof
const POLE = [0, -2, HT];
rev(POLE[0], POLE[1], HT - 0.4, 8, () => 0.15, () => set(WHITE, 0.8));

// ---------- the fountain and the trees ----------
rev(FX, FY, 0, 0.6, () => 3.4, () => set(WHITE, 0.95));
disc(FX, FY, 0.45, 0, 3.1, () => { set([0, 0, 0]); ck = 2; });

const tree = (x, y, r) => rev(x, y, 0, 2 * r + 2, (h) => (h < 2 ? 0.35 : Math.sqrt(Math.max(0, r * r - (h - 2 - r) * (h - 2 - r)))),
  (f, th, h) => set(h < 2 ? BARK : LEAF, 0.8 + 0.4 * hash(Math.floor(th * 3), Math.floor(h))));
for (const [x, y, r] of [[-27, 20, 2.8], [-27, 33, 3], [-17, 34, 2.4], [27, 18, 2.6], [26, 32, 3], [16, 35, 2.2], [-29, -10, 3.2], [29, -11, 3]]) tree(x, y, r);

// ---------- light it all, once ----------
const SUN = [1.0, 0.96, 0.88], AMB = [0.50, 0.58, 0.76];
const SHD = new Float32Array(N);
const cl = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
const lit = (x, y, z) => {
  const s1 = x * E1[0] + y * E1[1] + z * E1[2], s2 = x * E2[0] + y * E2[1] + z * E2[2];
  const dl = x * L[0] + y * L[1] + z * L[2];
  const gi = Math.floor(s1 / SC) + SO, gj = Math.floor(s2 / SC) + SO;
  let sum = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) sum += smap[(gj + dj) * SN + gi + di] > dl + 2 ? 0 : 1;
  return sum / 9;
};

const BAKED = new Array(N).fill(0);
for (let i = 0; i < N; i++) {
  if (zb[i] < -1e8) {
    const sx = (i % W) + 0.5, sy = Math.floor(i / W) + 0.5;
    const d = (sx - CX) / A, s = (2 * (sy - CY)) / A;
    const gx = (s + d) / 2, gy = (s - d) / 2;
    if (gx < GX0 || gx > GX1 || gy < GY0 || gy > GY1) continue;
    groundPaint(gx, gy);
    PX[i] = gx; PY[i] = gy; PZ[i] = 0; NX[i] = 0; NY[i] = 0; NZ[i] = 1;
    AR[i] = cr; AG[i] = cg; AB[i] = cb; KIND[i] = ck;
  }
  const sh = lit(PX[i], PY[i], PZ[i]);
  SHD[i] = sh;
  if (KIND[i] !== 1) continue;
  const lam = Math.max(0, NX[i] * L[0] + NY[i] * L[1] + NZ[i] * L[2]) * sh;
  const amb = 0.42 + 0.18 * NZ[i];
  BAKED[i] = rgb(cl(AR[i] * (AMB[0] * amb + SUN[0] * lam)), cl(AG[i] * (AMB[1] * amb + SUN[1] * lam)), cl(AB[i] * (AMB[2] * amb + SUN[2] * lam)));
}

// ---------- what moves ----------
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const skyAt = (y) => mix([0.30, 0.52, 0.86], [0.78, 0.88, 0.96], Math.min(1, Math.max(0, y / 110)));
const proj = (x, y, z) => [Math.floor(CX + (x - y) * A), Math.floor(CY + (x + y) * A / 2 - z * Z)];
const [PTX, PTY] = proj(POLE[0], POLE[1], HT + 7.6);    // the top of the flagpole
const [FJX, FJY] = proj(FX, FY, 0.5);                   // the foot of the fountain jet
const RED = rgb(200, 40, 52), WHT = rgb(245, 245, 245), BLU = rgb(40, 52, 120);

out(fn((x, y, t) => {
  // the flag: 5 by 3, stripes and a canton, rippling away from the pole
  const fx = x - PTX - 1;
  if (fx >= 0 && fx < 5) {
    const fy = y - PTY - Math.round(Math.sin(TAU * t / 12 - fx * 1.1) * 0.6 * (fx / 4));
    if (fy >= 0 && fy < 3) return fx < 2 && fy < 2 ? BLU : fy % 2 === 0 ? RED : WHT;
  }
  // the fountain jet: a white plume that breathes
  if (x === FJX && y < FJY && y >= FJY - 3 - ((t >> 1) % 2)) return rgb(235, 245, 255);
  if (Math.abs(x - FJX) === 1 && y === FJY - 1 && (t >> 1) % 2) return rgb(200, 225, 245);
  // two birds crossing once a loop
  for (const [b0, y0] of [[0, 14], [20, 19]]) {
    const bx = ((b0 + t * (160 / 96)) % 160) - 16, dx = x - bx;
    if (Math.abs(dx) <= 1.5) {
      const up = (t + b0) % 6 < 3;
      if (Math.abs(y - Math.round(y0 - (up ? 1.5 - Math.abs(dx) : -Math.abs(dx) * 0.4))) < 0.6) return rgb(50, 54, 70);
    }
  }
  const i = y * W + x;
  const k = KIND[i];
  if (k === 1) return BAKED[i];
  if (k === 2) {
    const g = Math.sin(PX[i] * 2.5 + TAU * t / 12) * Math.sin(PY[i] * 3.1 - TAU * t / 16);
    const c = g > 0.7 ? [0.85, 0.94, 1.0] : [0.28, 0.52, 0.72];
    const s = 0.6 + 0.4 * SHD[i];
    return rgb(cl(c[0] * s), cl(c[1] * s), cl(c[2] * s));
  }
  // sky: a soft gradient with fair-weather clouds drifting one canvas per loop
  let c = skyAt(y);
  const xp = x + t * (64 / 96);
  const puff = Math.sin(TAU * (2 * xp / 128)) * 0.5 + Math.sin(TAU * (4 * xp / 128) + y * 0.4) * 0.3 + 0.5;
  const band = Math.exp(-((y - 22) * (y - 22)) / 60);
  const dens = Math.max(0, puff * band - 0.45) * 2.2;
  if (dens > 0) c = mix(c, y < 22 ? [1, 1, 1] : [0.86, 0.9, 0.96], Math.min(0.9, dens));
  return rgb(cl(c[0]), cl(c[1]), cl(c[2]));
}));
`,
  },
  {
    id: 'logo',
    name: 'Blit logo',
    teaches: 'The brand mark: a gradient and a glint masked into a word',
    code: `// The Blit logo, drawn in Blit. The master bar renders this exact sketch, so
// change it here and the brand changes with it.
size(26, 13); fps(12); cycle(36);

// Chunky two-pixel strokes, seven rows tall: B L I T.
const word = sprite(\`
  xxxx..xx.....xx.xxxxxx
  xx.xx.xx.....xx...xx..
  xx.xx.xx.....xx...xx..
  xxxx..xx.....xx...xx..
  xx.xx.xx.....xx...xx..
  xx.xx.xx.....xx...xx..
  xxxx..xxxxx..xx...xx..
\`).pal({ x: '#ffffff' }).center();

// Violet, light at the top and deep at the foot, a row at a time.
const RAMP = ['#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9'].map((h) => color(h));
const body = fn((x, y) => RAMP[Math.max(0, Math.min(6, y - 3))]);

// A glint that sweeps across once a loop, off screen at both ends so it loops clean.
const shine = fn((x, y, t) => {
  const at = ((t % 36) / 36) * 60 - 14;
  const d = x + y * 0.6 - at;
  return d >= 0 && d < 2.5 ? rgb(255, 255, 255, 220) : rgb(0, 0, 0, 0);
});

out(stack(
  word.outline('#1e1033').shadow(1, 1, '#1e103399'),
  body.mask(word),
  shine.mask(word),
));
`,
  },
];

/** The sketch a fresh page opens with. */
export const STARTER = EXAMPLES[0];

export function findExample(id: string): Example | undefined {
  return EXAMPLES.find((e) => e.id === id);
}

---
title: "Blit language reference"
slug: "language"
---

# Blit language reference

A sketch is JavaScript with the algebra below in scope. One type carries all of
it:

```
Pattern = (x, y, ctx) => Color
```

`ctx` is what a pattern cannot know about itself: the canvas size, the clock, the
cycle length, the live palette and what the music is doing. `t` is `ctx.frame`,
the absolute frame counter, and it is passed to your `fn()` callbacks directly
because it is the field you want nearly every time. Transparent is a real color
(alpha 0), so no operator has to special-case a hole.

## Settings

Called for effect, anywhere in the sketch. The last call wins, and every value is
clamped rather than trusted.

| Call | Default | Range | Meaning |
|---|---|---|---|
| `size(w, h?)` | `32, 32` | 1 to 512 | Canvas size. One argument means square. |
| `fps(n)` | `12` | 1 to 60 | Playback rate. |
| `cycle(n)` | `8` | 1 to 256 | Frames per cycle. Every time operator is defined against this. |
| `ramp(name)` | `'default'` | see below | The ramp digits `0` to `9` index. |
| `out(pattern)` | | | The explicit sink. Wins over a returned value. |

Named ramps: `default` (a 10-step neutral value ramp), `pico8`, `sweetie`,
`gameboy`, `cga`, `ember`. Also available as data via `ramps.pico8`.

## Constructors

| Call | Result |
|---|---|
| `sprite(\`grid\`)` | A sprite from an ASCII grid. The clickable one. |
| `solid(color)` / `fill(color)` | One color everywhere. |
| `empty()` | Nothing. The identity for `stack`. |
| `fn((x, y, t, ctx) => color)` | Any function of position and time. |
| `frames(a, b, c, ...)` | One pattern per frame, cycling. |
| `live((a, t, ctx) => pattern, w?, h?)` | Rebuild the pattern every frame, from the music. See Audio. |
| `stack(a, b, c, ...)` | Layers. **Later arguments draw on top.** |
| `checker(a?, b?, size?)` | A checkerboard. |
| `grad(from?, to?, angle?)` | A linear gradient across the canvas. |
| `noise(seed?, animated?)` | Seeded value noise as greys. Reproducible. |
| `circle(r, color?)` | A filled circle, box `(2r+1)` square. |
| `rect(w, h, color?)` | A filled rectangle at the origin. |
| `text(str, color?, options?)` | Words, in a built-in pixel font. See below. |
| `blit(ref, x?, y?)` | Another saved sketch, by name or id, top-left corner at `(x, y)`. See Scenes. |
| `scene(a, b, c, ...)` | `stack` by another name: the layer list scene mode adds to. |

### Color helpers

`rgb(r, g, b, a?)`, `grey(v, a?)`, `hsl(h, s, l, a?)`, `color('#e43b44')`.

Anywhere a pattern is expected you may pass a color string (`'#e43b44'`), a
one-line sprite string (`'..##..'`), a packed color number, or a raw function.
A string with no newline is read as a color first and as a sprite if that fails.

### Alpha and transparency

Every color carries an alpha channel, and partial alpha is real: a translucent
layer is blended over whatever is under it (source-over), not rounded to on or
off.

| Form | Alpha range | Example, about 35% opaque |
|---|---|---|
| `rgb(r, g, b, a)` / `rgba(...)` | **0 to 255**, like the color channels. Omitted is 255. | `rgb(65, 166, 246, 90)` |
| `grey(v, a)` | **0 to 255**. | `grey(255, 90)` |
| `hsl(h, s, l, a)` | **0 to 1**, like `s` and `l`. Omitted is 1. | `hsl(205, 0.9, 0.6, 0.35)` |
| `'#rrggbbaa'` | `00` to `ff` | `'#41a6f65a'` |
| `'#rgba'` | `0` to `f`, each digit doubled | `'#4af6'` |

`hsl` is the odd one out on purpose: all of its inputs are fractions. Values
outside a range are clamped, so `rgb(255, 0, 0, 0.5)` is an almost invisible red
(alpha 0.5 of 255 rounds to 1), not a half-transparent one.

A hex color with alpha works anywhere a color does: in `.pal({ g: '#41a6f660' })`,
`.tint('#0008')`, `solid()`, `circle()`, `shadow()`. Alpha 0 is transparent
whatever the RGB says. `.tint(color)` multiplies the pattern's alpha by the
tint's, so tinting a translucent layer makes it more see-through, never less.

A translucent glow over a background, layered with `stack` (later layers draw on
top):

```js
size(32, 32);
const bg   = solid('#1a1c2c');
const halo = circle(10, '#41a6f628').center();          // 16% blue, wide
const glow = circle(6, rgb(115, 239, 247, 90)).center(); // 35% cyan
const core = circle(2, '#ffffff').center();
out(stack(bg, halo, glow, core));
```

The halo and glow both show the background through them, and where they overlap
the two alphas add up the way paint would. Pixels left fully transparent at the
end show the editor's checkerboard and stay transparent in a PNG export.

## Sprite grids

```js
sprite(`
  .ww.
  wwww
`)
```

- Leading and trailing blank lines are dropped, so the idiomatic form above is a
  4x2 sprite. Interior blank lines are kept: a gap in the middle is deliberate.
- Common indentation is stripped, so the grid does not inherit the surrounding
  code's indentation.
- Ragged rows are fine. Short rows read as transparent out to the widest row,
  which is the sprite's footprint.
- `.` and a space are transparent. Letters default to mnemonics, digits index the
  active ramp, and an unmapped character draws nothing and is reported as a
  warning in the right panel.

Default letters: `k` black, `d` dark grey, `s` slate, `l` light grey, `w` white,
`r` red, `o` orange, `y` yellow, `g` green, `t` teal, `c` cyan, `b` blue,
`i` indigo, `v` violet, `m` magenta, `p` pink, `n` brown.

## Text

`text()` answers a pattern with the string drawn into it, so a word composes with
everything else: outline it, tint it, centre it, animate it.

```js
text('HELLO')                          // the 3x5 caps font, white
text('HELLO', '#e43b44')               // a colour, positionally, like rect()
text('Hello', { font: '5x7' })         // or options, with or without a colour
text('Hello', '#e43b44', { gap: 2 })
```

| Option | Default | Meaning |
|---|---|---|
| `font` | `'3x5'` | `'3x5'` or `'5x7'`. An unknown name throws with the list. |
| `color` | `'#ffffff'` | Same as the positional colour, for a call that names everything it sets. |
| `gap` | 1 | Pixels between glyphs. |
| `line` | 1 | Pixels between lines, for a string with `\n` in it. |
| `align` | `'left'` | `'left'`, `'center'` or `'right'`, for short lines against the longest. |

**Two fonts, because the canvas is small.** The default canvas is 32 pixels
across. A five-wide font fits five characters on it, so `3x5` is the one that can
actually write a word on a sprite and it is the default for that reason. `5x7` is
the one with real lowercase, real descenders and every printable ASCII character,
for a canvas with room for it. `3x5` has no lowercase at all: at three pixels
wide there is no room for an x-height shorter than the caps, so it draws a
lowercase letter with its capital rather than with a guess.

**The advance is the ink, not the cell.** `I` is one pixel wide and `M` is five,
so `text('HI').w` is 5 and not 7. That is what makes a word read rather than look
like a ransom note, and it is why the box is worth asking for: `.w` and `.h` are
the text's own, so `.center()` centres the letters and `.outline()` rings them
rather than a rectangle.

A character in neither font draws as a solid block, which no real glyph looks
like — a missing character has to be visible as missing.

Text is not a sprite literal. The pixels have no home in the source, so clicking
one paints nothing, the same as `circle()` or `grad()`.

## Scenes

`blit(ref, x, y)` places another saved sketch in this one:

```js
size(512, 512);

out(scene(
  grad('#1a1c2c', '#3b5dc9', 90),
  blit('Coin', 40, 32),
  blit('Hero', 240, 400),
  blit(12, 300, 64),        // by id, for a name two sketches share
));
```

- `ref` is a sketch's **name**, matched exactly and then ignoring case, or its
  numeric **id**. A name no sketch has, or one two sketches share, is an error
  that says so.
- `x` and `y` are where its top-left corner goes, in whole pixels; left out,
  they are 0. Its box is its own `size()`.
- It runs in **its own world**: its `size()` is the canvas its `center`, `mirror`
  and `grad` see, its `cycle()` is what its `every` counts, its `ramp()` is what
  its digits index, and its clock runs at its own `fps()` against this one's. A
  32x32 coin that centres itself is still centred on its 32x32 at (40, 32).
- It is an ordinary pattern, so every operator applies: `blit('Coin', 8, 8).tint('#0008')`.
- Placed sketches can place others, up to 8 deep. A sketch that places itself,
  directly or through another, is an error rather than an infinite loop.
- It draws the **saved** version. Saving the placed sketch reaches every scene
  that uses it the next time the list is read.

`scene(...)` is `stack(...)` by another name. It does nothing `stack` does not;
naming it is how a sketch tells scene mode where new layers go. See the
interface guide, Scene mode.

A placed sketch is not paintable from the scene — its characters live in another
sketch's source. Open it to paint it. `blit()` needs the library of saved
sketches; anywhere without one it is an error that says so.

## Composition

| Method | Effect |
|---|---|
| `.stack(...others)` | Layer, later on top. |
| `.over(other)` | `other` on top of this. |
| `.under(other)` | `other` behind this. |
| `.shift(dx, dy)` | Move by whole pixels. Positive is right and down. |
| `.off(dx, dy, transform?)` | Stack an offset copy UNDERNEATH, optionally transformed. Strudel's `off`, in space. |

`.off` is why shadows, outlines and trails are one call:
`ship.off(1, 1, (p) => p.tint('#0008'))`.

## Space

| Method | Effect |
|---|---|
| `.flip(axis?)` | Reflect, replacing the original. |
| `.mirror(axis?, from?)` | Symmetry: one half is copied ONTO the other. Draw half a face, get a whole one. |
| `.rot(degrees?)` | Rotate clockwise. Multiples of 90 are exact and swap the box; other angles are a nearest-neighbour rotation. |
| `.tile()` | Repeat forever on the pattern's own box. |
| `.scale(n)` | Nearest-neighbour integer upscale. |
| `.crop(x, y, w, h)` | Cut a window, which becomes the new box at the origin. |
| `.center()` | Centre the box on the canvas. |

`axis` is `'x'` (default) or `'y'`. `mirror`'s `from` is `'low'` (default) or
`'high'`, choosing which half survives.

## Masking and color

| Method | Effect |
|---|---|
| `.mask(other)` | Keep only where `other` is visible. |
| `.cut(other)` | Erase where `other` is visible. |
| `.pal({ ch: color })` | Bind sprite characters to colors. |
| `.ramp(name \| colors)` | Switch the digit ramp. |
| `.palShift(n?)` | Rotate the ramp by `n` every cycle: palette cycling. |
| `.recolor(fn \| { from: to })` | Map the colors. Transparent pixels stay transparent. |
| `.tint(color)` | Replace the color, keep the shape, multiply the alphas. |
| `.outline(color?, diagonal?)` | A one-pixel outline, stacked underneath. |
| `.shadow(dx?, dy?, color?)` | Sugar for an offset tinted copy underneath. |
| `.dither(dark?, light?)` | Ordered (Bayer) dither between two colors on this pattern's luminance. |

### How palette scoping works

`.pal()` scopes to what it wraps, so a binding on one layer of a stack beats a
binding on the stack as a whole:

```js
stack(
  sprite(`aa`).pal({ a: '#e43b44' }),  // this layer is red
  sprite(`.a`),
).pal({ a: '#ffffff' })                 // everything else is white
```

Chained palette calls merge, with the later one winning, so both of these read
the way they look:

```js
p.pal({ a: 'red' }).pal({ a: 'blue' })   // blue
p.ramp('pico8').palShift(1)              // shifts the pico8 ramp
```

A transform between two palette calls deliberately breaks the chain, because at
that point `.pal()` is scoping a subtree rather than refining a sprite.

## Time

| Method | Effect |
|---|---|
| `.fast(n)` | The child sees `t * n`. |
| `.slow(n)` | Each child frame is held `n` ticks. |
| `.every(n, transform)` | Apply `transform` on the first of every `n` cycles. |
| `.when(cond, transform)` | Apply on a boolean, or on `(t) => boolean`. |
| `.seq(...others)` | Divide the cycle between this and the others, one slot each. |
| `.euclid(pulses, steps)` | Visible only on the onsets of a Euclidean rhythm. |
| `.degrade(amount?, seed?)` | Drop a fraction of pixels, deterministically. |
| `.hold(frame?)` | Freeze the clock. |
| `.onBeat(transform, hold?)` | Apply `transform` on a beat, and for `hold` SECONDS after it. |
| `.jux(transform)` | Original on the left half of the canvas, transformed copy on the right. Each half gets its own coordinate space and reported width, so both sides render a complete copy. |

`frames(a, b, c).slow(4)` holds each frame four ticks, because `slow` divides the
clock the frame index is read from.

`.fast()`, `.slow()` and `.hold()` retime the CLOCK, not the music. They derive a
context with a changed `frame` and everything else carried through, so a `live`
body under `.hold(0)` still rebuilds every frame, with a frozen `t` and a moving
`ctx.audio`. Measured: four rebuilds over four frames, all of them at `t = 0`.
The picture stops and the reactivity does not. That is usually what you want (a
still that flashes on the beat); when it is not, read the clock rather than the
music, or put the `.hold()` INSIDE the `live` callback, where it applies to the
pattern you built rather than to the rebuild.

This is documented rather than fixed, and deliberately. Retiming the music too
would mean the context carried a ring buffer of past frames, a permanent cost on
every render including the sketches that will never use it, and there is no
correct answer at all for `.fast(2)`: retiming the clock forward means asking for
audio from the future. A fix would have to special-case `fast` as "leave the
music alone", at which point the language has two rules where it now has one.

`recolor` deliberately does not touch holes: a blanket `recolor(() => '#000')`
means "make this sprite black", not "fill the canvas". Use `stack(solid(c), p)`
when a background is what you want.

## Audio

A sketch can be a function of the music. `ctx.audio` is a frozen frame describing
what is sounding right now, and it is `SILENCE` (every level zero, no events)
unless something supplies one, which is what keeps every render that does not ask
for music reproducible.

| Field | Meaning |
|---|---|
| `a.fft` | Per-bin level, lowest bin first. |
| `a.vol` | Total loudness of the latest analyser frame. |
| `a.bass` / `a.mid` / `a.treble` | The lowest bin, the mean of the middle ones, the highest. Derived from `a.fft`. |
| `a.beat` | An onset happened since the previous frame THIS sketch was given. |
| `a.sinceBeat` | Seconds since the last onset. `0` on the onset frame, `Infinity` before the first. |
| `a.cycle` | Transport position, in cycles. |
| `a.cps` | Cycles per second. There is no BPM anywhere on this path. |
| `a.playing` | True while the transport is running. |
| `a.haps` | The events sounding at `a.cycle`, each `{ s, note, gain, begin, end }`. |

Where the music comes from: whatever renders the sketch and passes an audio frame
in. This editor has no audio source of its own, so `a` is `SILENCE` here and a
`live` sketch is a still picture. A sketch that looks right at silence is a
sketch that has a resting state.

### `live` is the only way to be reactive, and that is not a style choice

A sketch BODY runs exactly once per edit, not once per frame. So anything read at
the top level is sampled when you press save and never again:

```js
// WRONG. Reads as reactive, renders as a still.
const level = someAmbientReader();
out(solid(grey(level * 255)));
```

There is no error and nothing for the lint to point at, because the code is
perfectly good code. It just does not do what it looks like it does. That is why
there are no ambient `bass()` / `vol()` globals in this language: any accessor
callable at the top level would be a trap with a friendly face.

`live` moves the read inside the frame, where it is re-read by construction
rather than by you remembering:

```js
out(live((a) => solid(grey(a.bass * 255))));
```

The callback gets `(a, t, ctx)`, mirroring `fn`'s `(x, y, t, ctx)`: the thing you
came for, then the clock, then the escape hatch. `fn` reaches the same frame
without any new API, because it already receives the whole context:

```js
out(fn((x, y, t, ctx) => (ctx.audio.bass > .3 ? '#ffffff' : null)));
```

Cost: ONE rebuild per frame, whatever the pixel count. The rebuild is memoised on
the context's identity and a render pass reuses one context for every pixel, so
a 32 by 32 picture is 1024 samples and one rebuild. A spritesheet rebuilds once
per frame of the sheet.

Pass `w` and `h` when the result has an intrinsic size. A pattern's box is read
at CONSTRUCT time, by `stack`, `center` and `crop`, and the box of a child that
has not been built yet is not knowable, so `live` reports whatever you tell it
and otherwise reports nothing (which falls back to the canvas size):

```js
out(live((a) => circle(2 + a.vol, '#e43b44'), 8, 8).center());
```

### Events, not a picture of them

`a.haps` is what is actually sounding, as data. A visual toolkit built on shaders
would hand you the other program's rendered PIXELS, because filtering an image is
what a shader does. Blit composes its own pixels out of an algebra, so pixels are
not the useful thing to hand it; note names and gains are, because those are what
a sprite can be a function of.

```js
size(32, 32); fps(24); cycle(16);

out(live((a) => stack(
  checker('#1a1a2e', '#16213e', 4),
  ...a.haps.map((hap, i) =>
    circle(2 + hap.gain * 4, hap.s === 'bd' ? '#e43b44' : '#41a6f6')
      .shift(4 + i * 6, 16)),
), 32, 32));
```

Two rules, both enforced rather than advised:

- `a.haps` is capped at 256 entries, so a runaway pattern cannot make a render
  allocate without bound.
- nothing in `a.haps` is a function. It is plain data, because this shape crosses
  a boundary between programs.

### `.onBeat`

`.onBeat(transform, hold?)` applies `transform` on an onset and for `hold`
SECONDS after it. Seconds, not frames: a sketch runs on its own `fps()` while
onsets arrive on the audio clock, so counting frames would mean one thing at
12fps and another at 60.

```js
out(sprite(`ww\nww`).onBeat((p) => p.scale(2), 0.15));
```

It is sugar over `.when()`, which you can write yourself if you want a different
window: `.when((t, ctx) => ctx.audio.vol > 20, (p) => p.tint('#ffffff'))`.

## Determinism

`noise` and `degrade` are hashes of position, seed and frame, never
`Math.random`. Same sketch, same picture, every run. That matters because a
generative sprite you cannot reproduce is not a sprite you can iterate on.

`live` is reproducible exactly when `ctx.audio` is `SILENCE`, which is every
render that does not supply music: the spritesheet, the PNG export, and every
test. A sketch that never mentions the music renders byte for byte what it
rendered before the field existed, which is the whole reason the default is a
shared frozen value rather than something assembled per render.

## Scope

A sketch is compiled in **strict mode**. In practice that means one thing: a name
you assign to has to be declared.

```js
wdith = 32          // ReferenceError: wdith is not defined
let width = 32      // fine
```

This is deliberately noisy. Without it, `wdith = 32` would be a silent success
that set a property on the browser window and left the sketch's size alone, so a
one-character typo would look like Blit ignoring you. Reported as **didn't run**,
with the name in the message.

**A sketch cannot declare a name the language already binds.** Every name in
this reference (`sprite`, `grad`, `live`, `text`, `out`, all of them) is a
parameter of the function a sketch compiles to, so `const grad = ...` is a
redeclaration and the sketch does not compile:

```js
const grad = (a, b) => a   // 'grad' is already part of the language, so a
                           // sketch cannot declare it. Rename it.
```

The error names the built-in and points at the line that declares it. Shadowing
is not forbidden out of tidiness; there is simply no way to bind the name twice
in one scope, and a sketch that redefined `sprite` could not call the real one
again anyway.

Only the TOP level collides. Inside any nested scope the name is yours:

```js
out(fn((x, y) => { const grad = x / 32; return grey(grad * 255); }))   // fine
```

Running the sketch tells you at once, because it cannot compile. Checking it
without running it now tells you too, which it did not used to: the `redeclared`
rule below is new, and before it the name check counted the declaration as a
binding and then skipped every reference to it, so declaring a language name
actively silenced the only check that might have noticed. A sketch checked
through `POST /api/blit/lint` came back green and hard-failed at compile the next
time anybody opened it. That is the worst answer a checker can give, and it was
reserved for the one mistake that is certain to fail.

The rule has one known gap, and it is deliberate. `const { live } = x` does
collide, but the grammar records that binding as a property key rather than a
definition, and treating every key as a binding would report `const { live: mine
} = x`, which is legal. This file's rules always over-accept rather than
over-report: a missed report leaves a sketch failing the way it already fails,
while a false one would be the lint being wrong about working code.

## Errors

Failures are reported by phase, because in live coding the distinction matters:

- **didn't parse**: the buffer is not valid JavaScript yet. Usually mid-keystroke.
- **didn't run**: it parsed but threw, or produced something that is not a
  pattern.
- **failed while drawing**: it ran but threw part way through the loop, which
  frame 0 alone would not have caught.

Each is reported **with the line it happened on** where that can be established
soundly, both in the message and as a marker in the editor's gutter, so a stray
bracket in forty lines is a glance rather than a hunt.

Two different mechanisms are behind that one line number, which is worth knowing
because they fail differently:

- **didn't run** and **failed while drawing** read the position out of the thrown
  error's own stack. It is exact.
- **didn't parse** cannot. A JavaScript engine reports a parse failure inside a
  compiled function with no position in it at all, so the line comes from the same
  grammar the editor uses for highlighting, asked where it first could not
  continue. For the usual mid-keystroke case that is the end of what you have
  typed, which is where the cursor already is.

When neither can give an answer it can stand behind, the message appears without
a line rather than with a guess: a marker pointing at code that is fine is worse
than no marker.

The last successful pattern keeps playing until a new one replaces it.

## Checking a sketch without running it

`POST /api/blit/lint` answers whether a sketch holds up, and saves nothing. It
exists for scripts and tools — a person gets all of this from the gutter as they
type, and a program writing a sketch through the API has no gutter.

It **parses; it never runs**. That is not a performance choice: the check runs on
the server, and Blit's promise is that a sketch is evaluated in the tab of the
person who typed it and nowhere else. So the route asks the grammar the same
question the editor's highlighter asks, and reads names off the tree.

Five things it reports:

| Rule | What it catches |
|---|---|
| `syntax` | The point where the buffer stops being valid JavaScript. |
| `unknown-name` | A name that is neither in the language nor declared by the sketch. |
| `unknown-method` | An operator a pattern does not have, anywhere in a chain. |
| `no-output` | Statements that never call `out()`, which can never produce a pattern. |
| `redeclared` | A top-level declaration of a name the language already binds, which cannot compile. |

`unknown-name` is an **error** when there is a name close enough to be the one
that was meant (`sprit` for `sprite`) and a **warning** otherwise: this check
cannot see the page the sketch will run in, and a name it does not recognise may
genuinely be there. Warnings do not clear `ok`.

Every answer also carries `vocabulary` — every global name a sketch has in scope —
and `operators`, every method that answers another pattern. Both are read off the
evaluator's own scope object and the `Pat` class rather than written out, so they
cannot fall behind the language. For a caller with no browser they are the only
way to discover what there is.

Two names are held back from those lists and still accepted: `__spriteAt`, which
is what the source scanner rewrites `sprite(` into, and `withMod`, which is
`Pat`'s own internal. Offering them would be advertising machinery as language;
rejecting them would be the check lying about code that works.

What it cannot tell you, and no static check could: whether the picture is right.
A character with no colour, a sketch that returns a string, a divide by zero
inside `fn`, an animation that goes wrong on frame 5 — all of that needs the
pattern to actually run, and the browser is the only place that happens.

A syntax error's **position** is exactly the editor's, because it comes from the
same parse. Its **wording** is not: the editor quotes V8, and there is no engine
on this path.

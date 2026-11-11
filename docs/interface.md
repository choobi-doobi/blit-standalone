---
title: "Blit interface"
slug: "interface"
---

# Blit interface

The language reference covers what a sketch can say. This page covers the
surface you say it on: where things are, what the keyboard does, and what
changes on a touch screen.

## Layout

Blit's chrome is the **Fluent 2** design system (`@fluentui/react-components`
v9), the design language Office and Teams use. Fluent components (buttons, tabs, the name field,
badges, tooltips, dialogs) colour Blit's command bar, panels, cards and drawer,
and nothing else. The code keeps its own editor theme, because syntax colours are
the one surface a second palette would actively fight.

Blit wears a violet brand, not Fluent's default blue: a `BrandVariants` ramp
seeded from violet at Fluent's primary slot, declared once in
`client/lib/blitTheme.ts` and turned into a light and a dark theme. A
`<FluentProvider>` applies it. Light or dark follows the `data-theme` attribute
that `client/main.tsx` sets from the OS setting, or from `?theme=light|dark`,
which is remembered in the browser.

That provider is a `display: contents` theme pin: its colour variables cascade,
but it emits no layout box of its own, and Blit's full-height flex layout lives on
a real element nested inside it. A `<FluentProvider>` is a block-level `<div>` at
`height: auto` by default, and left in the flex chain between the
full-height page and Blit's `height: 100%` workbench it collapses that chain — the
three columns stack and the canvas loses its height. Keep the pin between the two.

Three zones on a slightly tinted canvas:

| Zone | Holds |
| --- | --- |
| Left | Your saved sketches as a tree of folders, then the example library |
| Centre | A rounded card: the command bar, the canvas, and the editor beside or under it |
| Right | Brush, view, sketch facts, export |

The two side panels sit directly on the canvas with no card of their own; what
separates them from the middle is that card's edge and its shadow, not a border
of their own.

### Type and density

Fluent's scale, so that anything added later matches what is already there:

| Role | Size |
| --- | --- |
| Panel title | 16px semibold |
| Section heading, button label, a field's value | 14px semibold or regular |
| Caption, badge, chip, a row's second line | 12px |
| Command icon | 20px, or 16px on a small command |

The base is 14px/20px, set on Blit's Fluent scope. The browser's base is 16px, so
anything without an explicit size would sit a step larger than the Fluent text
beside it.

Every left edge inside a panel is 12px — the title, the section headings, the
body pad and a row's text — so the column has one margin rather than a ragged
one.

The command bar reads left to right in Fluent's order: what you are doing to the
running sketch (play, step, reset), then what you are doing to the document (run,
save), then what the document is (its name). The two state badges sit at the far
end, where they read as a report rather than a warning.

It is one tab stop, not eight: Tab enters the bar and leaves it, and the arrow
keys move along it, wrapping at each end. The name field keeps its own arrow
keys, since there they move the caret.

Both side panels collapse to a 48px rail, and both remember their width between
visits. The resize edge between a panel and the card is invisible until you hover
it, focus it or drag it, and then shows a short brand line; it also takes focus,
and then arrow keys move it in 8px steps, or 32px with Shift held.

Below roughly 1024px the two panels fold into a single drawer that comes in from
the right over a dimmed page. One is open at a time. Tapping the dimmed area
closes it, as does `Escape`. The drawer does not repeat the panel's name above
it, so each panel is titled exactly once wherever it appears.

### The canvas and the editor

Inside the card the two are separated by the same Fluent splitter, and it works
the same way: drag it, or focus it and use the arrow keys in 8px steps, 32px with
Shift. **Double-click it, or press `Home` with it focused, to go back to the
default split.**

**Which way they sit is a choice**, in the Inspector's View section:

| Arrangement | What you get |
| --- | --- |
| Stacked | The canvas above the editor. The default, and the shape Blit has always had |
| Side by side | The canvas and the editor in two columns |

Side by side is for a wide screen and a tall sketch: a 64x64 canvas at 8x is
taller than half a window, and stacked it leaves the editor a slot. Stacked is
better for a long chain, where the line you are editing is what you want room
for.

**Each arrangement remembers its own split**, because they are not the same
question: stacked, the editor usually wants most of the height; side by side, an
even split is the usual answer. Switching arrangement is not meant to undo the
sizing you just did.

The split is kept as a FRACTION of the card, not a pixel height, so resizing the
window moves both panes rather than making the editor absorb the whole change.
Neither pane can be dragged below 15% — below that it is a sliver, not a pane.

Below roughly 768px there is only one arrangement that fits, so the narrow layout
stays stacked whatever was chosen on a bigger screen, and the control is not
shown. The choice is remembered rather than overwritten: a phone does not get to
decide what the desktop looks like.

### Zoom

The View section's chips set how closely the canvas is drawn: 1x, 2x, 4x, 8x, 12x
and 16x screen pixels per sketch pixel. **A sketch opens at 2x**, which keeps a
big grid on screen whole; a 16x16 icon is the case that wants 8x or more.

**Zoom is saved with the sketch**, on the server, by Save or `Ctrl`/`Cmd` + `S`.
It is not a browser preference, because it is not one answer for every sketch: a
128x128 import and a 16x16 icon are not looked at from the same distance, and a
setting that followed the browser would be wrong for whichever you opened next.
So a sketch comes back at the zoom you left it at, on any machine you open it on.

Changing the zoom therefore counts as **unsaved**, the same as changing the text.
It is not written on its own: saving writes the sketch, and the zoom rides along.

The six steps are the whole vocabulary — the API stores those and refuses
anything else, so a saved sketch can never open at a zoom the chips cannot get
back to.

One interaction worth knowing: **the pixel grid only draws from 6x**, so at the
2x default the Pixel grid switch has nothing to show. Below that the grid lines
would be as wide as the pixels they separate.

### When the picture is bigger than the stage

A picture that fits is centred on the stage. One that does not **scrolls, edge to
edge, in both directions** — in either arrangement, at any split, and on the
narrow layout. Scroll it with a wheel, a trackpad, or the scrollbars; the scroll
stops at the canvas rather than carrying on into the page behind it.

**Zooming keeps the middle of the view put.** Going from 2x to 16x on a large
sprite enlarges what you were already looking at rather than dropping you in its
top-left corner, and zooming back out retraces the same point until the whole
picture fits, at which point it is centred again. Opening a sketch, or changing
`size()`, starts in the middle of the new picture.

Shrinking the stage — dragging the splitter, collapsing a rail, resizing the
window — only ever changes how much of the picture is in view. It never puts any
of it out of reach.

## Keyboard

| Key | Does |
| --- | --- |
| `Ctrl`/`Cmd` + `Enter` | Run the sketch. Works inside the editor and outside it |
| `Ctrl`/`Cmd` + `S` | Save the sketch. Works from anywhere, including the name field |
| `Ctrl`/`Cmd` + `Z` | Undo, including a painted pixel. Works from the canvas too |
| `Ctrl`/`Cmd` + `Shift` + `Z`, or `Ctrl` + `Y` | Redo |
| `Space` | Play or pause |
| `.` | Step one frame forward. `,` steps back |
| `Escape` | Close the drawer, on the narrow layout. In scene mode, let go of the picked sketch |
| `Arrow` keys | In scene mode, nudge the picked sketch one pixel; `Shift` for eight. Each press is one undo step |
| `Arrow` keys | Resize a panel, or the canvas and the editor, when the drag handle has focus |
| `Home` | Reset the canvas/editor split, with its handle focused |

In the sketch tree, which is one tab stop:

| Key | Does |
| --- | --- |
| `Up` / `Down`, `Home` / `End` | Move along the visible rows |
| `Right` | Open a folder, or step into an open one |
| `Left` | Close a folder, or step out to the one it is in |
| `Enter` | Open a sketch, or open or close a folder |
| `F2` | Rename in place. `Enter` keeps it, `Escape` does not |
| `Delete` | Delete a sketch, or a folder (its contents move up a level) |
| `Shift` + `F10`, or the menu key | The row's menu: open, rename, move to, delete |

Blit deliberately claims nothing else. `Ctrl`/`Cmd` + `Shift` + `S` is left to the browser as Save As,
and every other chord inside the editor is CodeMirror's.

Save is the one chord that fires while a text field has focus, because the moment
you most want it is straight after typing a sketch name. Every other shortcut
stays out of text entry so it cannot fire mid-word.

Painting and typing share one undo history, because painting a pixel *is* an
edit to the source. That needs saying because the canvas takes no focus, so
without help the editor would never see the keystroke and a painted pixel would
look permanent. Undo from the canvas works for that reason.

Undo granularity follows the editor, not a paint program: each gesture starts a
new undo entry, so one click or one drag is one press of `Ctrl`/`Cmd` + `Z`, and
two separate clicks are two presses even in quick succession. Within a single
drag the editor still groups by elapsed time the way it does for typing, so a
drag held slower than about half a second per pixel can take a second press.

## Running and saving

The toolbar's state is worth reading literally, because live coding has two
kinds of "not saved":

- **edited** means the buffer has moved since you last ran it. The canvas is
  still showing the last thing you ran. This is a normal mid-edit state, not an
  error, so Blit shows it rather than quietly re-running.
- **unsaved** means the sketch differs from the copy on the server — its text,
  its name, or the zoom it is being looked at, all three of which Save writes.

Both appear as small pills in the toolbar, next to Run and Save respectively, so
they read as state rather than as a warning about something you did wrong.

### When a sketch fails

The bar above the editor names the phase, the line and the message, in that order:
`This sketch didn't parse, line 12: Unexpected token ')'`. The same line is marked
in the editor's gutter, and both clear as soon as the sketch runs.

The line is omitted rather than guessed when it cannot be established — see the
language reference for why a parse failure and a runtime failure get their
positions from different places. The canvas keeps playing the last sketch that
worked either way.

A sketch is compiled two ways — as one expression, and as statements — and the
message you get is from whichever of them read the sketch the way it was
written. That matters for one case in particular: **declaring a name the
language already owns**, like `const grad = ...`, which is a redeclaration and
cannot compile. It is reported as `'grad' is already part of the language, so a
sketch cannot declare it. Rename it.`, on the line that declares it.

### Unsaved work survives a reload

The buffer is kept in the browser as a draft while it differs from the version it
was opened from, so closing the tab, reloading, or a crash does not throw away
what you had typed. The draft is written about half a second after you stop
typing, and is removed again the moment the buffer matches what is saved.

Drafts are kept per sketch. A saved sketch's draft comes back when you open that
sketch; an unsaved one comes back when the page loads. Either way Blit says so in
a bar above the editor rather than restoring text silently, and offers **Discard**
to go back to the version it was typed on top of.

If the sketch was also saved somewhere else while a draft was sitting on disk, the
bar says that too: the draft is still restored, because unsaved keystrokes are the
thing at risk, but it is no longer a change on top of what is saved, so Discard is
a real choice rather than an undo.

Nothing about a draft is a substitute for saving. It lives in one browser on one
machine, it is not on the server, and clearing site data removes it.

### The transport

The command bar carries the whole transport: step back, play/pause, step, reset,
then a scrub along the cycle and a readout of where in it you are.

The readout is `slot / cycle` — the position in the loop, not the absolute frame,
because that is what a time operator like `frames()` or `.every()` keys off. The
absolute frame and which repetition of the cycle you are on are in its tooltip.

The scrub moves you along the cycle you are already in, rather than jumping to
the same slot of the first one. Scrubbing to slot 1 while on frame 37 of an
8-frame cycle goes to frame 33, not frame 1, so operators defined against the
cycle keep their phase while you look around inside it. Reset is the one control
that goes all the way back to frame 0.

Anything that seeks also pauses, including both step keys. A frame you stepped to
and then lost a tick later is not a frame you got to look at.

Every one of these is keyboard-operable, and the scrub keeps its own arrow keys
rather than handing them to the toolbar. Space is the exception worth knowing:
when a button has focus, Space presses that button and does not touch playback,
because on a focused control Space already means something.

### Playback and reduced motion

A time-based sketch starts running as soon as it is evaluated, and Play/Pause in
the toolbar holds it on the current frame.

The one exception is the viewer's own motion preference. If the operating system
is set to reduce motion (macOS Reduce Motion, Windows "show animations off",
`prefers-reduced-motion: reduce`), Blit opens paused on frame 0 instead of
animating unasked. Everything else is unchanged: the sketch has been evaluated,
the canvas is drawn, and pressing Play runs it. The preference is read once, when
the page mounts, so pressing Play is an explicit choice that Blit does not then
override.

Clicking a pixel on the canvas edits the sketch's source text, so a run happens
first if the buffer is dirty. Otherwise the character offsets Blit is about to
patch would belong to text you had already changed.

## Painting

The right column's palette doubles as the brush. It lists what the renderer
actually **measured** while drawing the current frame, not what a scan of the
source guessed, so a `.pal()` buried deep in a chain shows up correctly and a
character with no colour is reported because the sketch really asked for it.

Click a pixel to paint the selected character into the sprite literal it came
from. Alt-click or right-click erases instead. Only pixels that came from a
`sprite()` literal can be painted; a pixel produced by `grad()` or `noise()` has
no character in the source to change, so a click there does nothing.

## Scene mode

**Scene** in the command bar (or the Scene section of the right panel) switches
what a click on the canvas does: instead of painting a character, it picks up a
placed sketch — a `blit()` call — and a drag moves it. Every placed sketch gets a
dashed box, and the picked one a solid one. Picking one also selects its call in
the editor, so the code always says which line a drag is about to change.

A drag is drawn live and written once: the picture follows the pointer with no
re-evaluation, and on release the call's two numbers are rewritten in the
source, as one undo step. The arrow keys nudge the picked sketch the same way.

Only a position written as plain numbers (or left out, meaning 0, 0) can be
dragged. `blit('Coin', i * 16, 0)` is the sketch's own arithmetic, and
rewriting it into a literal would throw that logic away, so such an instance is
pickable but moves in the code; so is a call that runs more than once, in a loop.

**Placing a sketch** writes a call too, two ways:

- Pick it from **Place a sketch** in the Scene section. It lands centred on the
  canvas.
- Drag its row from the sketch list onto the canvas. It lands centred where it
  was dropped.

It is added to the first `scene(...)` in the source, as its last layer, in that
call's own layout. With no `scene(` yet, what the sketch outputs is wrapped in
one: `out(x)` becomes `out(scene(x, blit(...)))`, a bare expression becomes a
`scene()` of itself and the new layer. A sketch with more than one `out()` is
refused with a message, because guessing which output was meant would put the
layer somewhere nobody asked for. The reference is the sketch's name when that
is unique, and its id when it is not. A sketch cannot be placed in itself.

Paint mode never reaches into a placed sketch: its characters belong to another
sketch's source, so a click on one paints nothing, and its colours stay out of
this sketch's palette panel.

## Export

The right panel's Export section: **Frame PNG**, **Spritesheet**, **Loop**,
**Aseprite** and **Source**.

**Loop** is one cycle as an animated GIF, at the zoom you are working at, looping
forever. It starts at frame 0 rather than wherever the playhead happens to be,
because a loop that begins mid-stride is not the loop the sketch describes.

It is a GIF so it plays anywhere. Up to 255 colours in each frame export
exactly; more are median-cut to 255. Pixels under half alpha are transparent and
the rest opaque, and each frame clears the last, so transparency stays real.

A static sketch exports as many identical frames, which is the honest answer to
"export this cycle" rather than a bug.

Large loops encode one frame at a time, keeping only compressed frames for the
download. Zoom reduces automatically, with natural size as the minimum: a
256-frame, 512x512 loop exports all 256 frames at 512x512. The browser can handle
input between frames while the export buttons show that the job is running.

**Aseprite** is the cycle as an `.aseprite` file: one frame per frame, each with
the sketch's timing, on a layer named after the sketch and tagged as the loop.
It is for the third audience — not an engine and not a viewer, but somebody who
wants to keep drawing.

It is **indexed when the sketch fits a palette** and RGBA when it does not. Up to
256 distinct colours become the sprite's own palette, with index 0 reserved for
transparent, which is what keeps recolouring and palette cycling possible over
there. A sketch with more than that — a gradient, noise, a dithered plasma —
comes over as RGBA rather than being quantised to fit. Either way the colours are
exact, partial alpha included.

Unlike the loop, it is **always at natural size**: zoom is a way of looking at a
sketch, not a property of it, and a pixel editor wants the grid rather than a
picture of it. With no zoom to reduce, an oversized loop is refused rather than
shrunk.

## Import

The right panel's **Import** section, or a PNG dropped on the canvas.

What comes back is **source**, not a picture: a `sprite()` grid and the `.pal()`
that binds its characters, which is then ordinary code to edit, parameterise and
animate. That is the whole reason the feature is allowed to exist. An importer
that produced an opaque bitmap layer would make Blit a worse pixel editor; this
one makes an existing sprite into something the language can work on.

Where it lands depends on what is already there. An empty buffer gets a complete
sketch, `size()` and all, and takes its name from the file. A buffer with work in
it gets just the expression, at the cursor, so bringing in a reference never
costs what was already open. Either way it is one undo step.

Characters are chosen to be read, not just to be unique: a colour close to one of
the letter mnemonics borrows that letter, so white pixels are `w` and red ones
`r`, and the exact colour is bound in the `.pal()` beside it. A character is left
unbound only when the letter already means exactly that colour. Transparent is
`.`, never a space, because the grid parser trims trailing spaces and would
quietly narrow a sprite whose right-hand column is empty.

No colour is approximated. Every distinct colour that reaches the grid gets its
own character, which is what makes the import exact: evaluate what it emits,
render it at that size, and the pixels are the file's. Two things follow:

- **PNG only.** Not a format preference: the decode reads the PNG bytes directly
  rather than going through a canvas, because a canvas stores colour
  premultiplied by alpha and hands back `#3c5ec980` for a pixel that was
  `#3b5dc980`. Opaque art survives that; anything with partial alpha does not.
- **Up to 35 colours.** Refused rather than reduced, with the count. A photograph
  has hundreds and would come back as unreadable source; which ones to lose is a
  decision for a pixel editor, and saying so is more use than guessing.

Above 64 pixels a side, or 24 colours, the import goes ahead and says it is
getting unwieldy.

### Choosing a size

A file may be up to 1024x1024. A **grid** stops at 128x128, because a sprite
literal is one character per pixel and 128 square is already 16k of source. Those
are two different numbers on purpose: pixel art is routinely shared at a multiple
of the size it was drawn at, so the 32x32 arrives as a 512x512 PNG, and refusing
that file would be refusing the common case for a reason that is about the grid
rather than the picture.

So anything over 128 gets a size chosen for it, in a bar above the editor rather
than in the Import section. The bar is where a dropped file can reach it with the
right panel collapsed, and it is the same pattern the restored-draft notice uses:
a pending thing, with the choices next to it.

Each choice shows the grid it would produce and, after a dot, how many colours
that grid would have. Those counts are measured, not estimated: the
resize is done and the palette counted before anything is offered, which is what
makes the difference between "this is a sprite" and "this is a photograph and
Blit is the wrong tool" visible before you commit to it.

One choice can be marked as losing nothing, and the bar says so. That happens
when the image is a whole-number upscale of a smaller one, which is exactly the
512x512-that-is-really-a-32x32 case: sampling at the right size recovers the
sprite somebody drew, byte for byte, rather than an approximation of it.

**The resize happens on the server**, and it is nearest-neighbour only. Every
other filter, from box to Lanczos, computes a weighted average, and an average of
two colours is a third colour that was in no pixel of the file. On a photograph
that is the point; here it would invent palette entries, blow the 35-colour cap
in one step, and lose the exactness the rest of this section rests on. Picking
pixels keeps the palette a subset of the file's.

A size whose grid would need more than 35 colours is not an error and does not
close the bar: the count is shown where the choice is, and a smaller size is one
click away.

## Touch

On a coarse pointer the dense controls, the palette swatches, the zoom steps and
the row actions, grow to a 44px minimum target. The desktop layout keeps its
density; nothing moves.

A row's "…" menu button in the sketch tree appears on hover or keyboard focus on
a mouse, and is always visible under a coarse pointer, because the same tree is
what the drawer shows and a right-click has no touch equivalent at all. Moving
things on a touch screen goes through that menu's Move to, since a drag there
scrolls.

Fluent's motion is all decoration here: a shimmer on the loading rows, the drawer
sliding in, an underline growing under a focused field. Under a reduced-motion
preference it is dropped outright rather than shortened, and an animated sketch
opens paused.

## Linking to a sketch

`/?sketch=<id>` opens that saved sketch in the editor (with its draft, if one is
waiting), exactly as clicking it in the sketch list does. The parameter is
removed from the address once read, so a refresh does not reopen it.

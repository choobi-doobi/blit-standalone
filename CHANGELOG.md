# Changelog

All notable changes to Blit.

## 2.0.0

### Changed

- **Blit is a standalone Node.js app.** It no longer runs as a Core plugin: an
  Express server with its own SQLite database (`BLIT_DB`, default
  `data/blit.db`) serves the API under `/api/blit` and the built React client.
  `npm install && npm run build && npm start`.
- No users, accounts or permissions. Sketches and folders are one shared
  library; the schema has no owner column.

### Removed

- The Core host integration: module manifest, MCP tools, Cmd-K Global Search
  source, the Strudel channel renderer and its `/api/blit/strudel/*` routes, and
  the bundled agent skills.

## 1.19.1

### Fixed

- **Large sprites export their full GIF loop.** A 256-frame, 512x512 sketch such
  as Mac Ch4 no longer fails with "That is too much to animate at once". Frames
  are rendered and compressed one at a time, keeping only compressed blocks for
  the download. Zoom reduces to natural size when needed; dimensions and the
  cycle are preserved.
- GIF frames use individual palettes, preserving up to 255 opaque colours per
  frame. Transparency, loop timing and disposal are retained, and the browser
  handles input between frames while exporting.

## 1.19.0

### Changed

- **Loop export is now an animated GIF instead of an animated PNG.** The APNG
  showed as a still frame in most places it was shared. The GIF plays
  everywhere, loops forever, keeps the sketch's fps (to GIF's 1/100 s), and
  clears between frames so transparency stays real. Up to 255 colours export
  exactly; more are median-cut to 255. Pixels under half alpha are transparent.

## 1.18.0

### Added

- **`blit_render_sketch` / `POST /api/blit/render`: see a sketch as a PNG.** An
  agent can now look at what it drew. Renders a saved sketch or unsaved code with
  the real engine, one frame or up to 16 as a contact sheet, upscaled
  nearest-neighbour, transparency over a checkerboard (or raw alpha, or a colour).
  Scenes resolve `blit()` against the caller's own sketches. A sketch that fails
  answers 422 with the engine's message and line.
- **Sketches run on the server in exactly one place, in a sandbox.** The render
  runs in a separate Node process with an empty environment, Node's permission
  model (no file access, child processes or workers), a 256MB heap and a time
  limit, inside a null-prototype vm context that only strings cross. Tested
  against the known vm escapes.
- **`blit_edit_sketch` / `PATCH /api/blit/sketches/{id}/edit`: partial edits.**
  Exact find/replace edits applied in order and saved together; each must match
  once (or say `all`), otherwise nothing is saved. Answers a lint of the result
  instead of the code.
- **Docs: alpha and transparency.** The language reference now states each
  form's alpha range (`rgb`/`grey` 0-255, `hsl` 0-1, `#rrggbbaa`, `#rgba`), how
  translucent layers blend, and a see-through glow example.
- **Agent skills live in this repository** (`skills/blit`, `skills/blit-iso`),
  with a test that every example and the iso renderer compile and render.
- **Iso renderer: lying cylinders and per-pixel depth.** `cylX` / `cylY` for
  pipes, logs and barrels on their side; depth is now a per-pixel ray cast
  (nearest hit wins) instead of a whole-object sort, static geometry is baked
  once at load, movers are hit-tested per frame, and `billboardK` gives sprite
  characters exact depth.

### Fixed

- **The iso skill's renderer compiles again.** It declared `const scene`, which
  became a language name in 1.16.0; its fn is now `world`.

## 1.17.0

### Added

- **Global Search.** Blit contributes a "Sprites" source to the host's Cmd-K
  palette: `GET /api/blit/search/global?q=&limit=` finds the caller's own saved
  sketches by name (not the built-in examples), newest edit first, with the
  folder name as the snippet.
- **`/blit?sketch=<id>` opens that saved sketch**, which is where a search
  result links.

## 1.16.0

### Added

- **Scenes: sketches inside sketches.** `blit(ref, x, y)` places another saved
  sketch, by name or id, with its top-left corner at (x, y). It runs in its own
  world — its own size, clock rate, cycle and ramp — so a 32x32 sprite drops
  into a 512x512 scene unchanged. Placed sketches nest up to 8 deep; a sketch
  that places itself is an error. `scene(...)` is `stack` by the name scene mode
  looks for.
- **Scene mode.** A Scene toggle in the command bar: a click picks up a placed
  sketch, a drag moves it (drawn live, written to the call's numbers on
  release), the arrow keys nudge it, and every edit is one undo step. Place a
  sketch from the new Scene section of the right panel, or by dragging its row
  from the sketch list onto the canvas; the call is added to the sketch's
  `scene(...)`, or wraps what it outputs in one.

## 1.15.0

### Added

- **Folders.** Saved sketches live in a tree of nested folders, drawn in the left
  panel like Vault's Library explorer: folders first with a count of what they
  hold, a filter, a recent/name sort, New folder and Collapse all. Make and
  rename folders in place, file sketches and folders by dragging or with Move
  to, start a sketch inside a folder with New sketch here. Deleting a folder
  keeps everything in it, one level up. Moving a sketch leaves its edit time
  alone. Keyboard: the WAI-ARIA tree pattern plus F2, Delete and Shift+F10.
- `GET/POST /api/blit/folders`, `PATCH/DELETE /api/blit/folders/{id}`,
  `PUT /api/blit/sketches/{id}/folder`; sketches carry `folder_id`, and
  `POST /api/blit/sketches` takes one. Migration `003_folders.sql`.
- **MCP:** `blit_list_folders`, `blit_create_folder`, `blit_rename_folder`
  (rename, move, or both) and `blit_move_sketch_to_folder`; `blit_create_sketch`
  takes `folder_id`. Deleting a folder is deliberately not a tool.

## 1.14.1

### Fixed

- **The workbench renders again.** The `<FluentProvider>` that pins Blit's theme
  is a block-level `<div>` at `height: auto`. Sitting inside the host's
  full-height page and above Blit's `height: 100%` flex chain, that block box
  broke the chain: the three columns stacked vertically and the canvas could
  collapse to zero height — present in the DOM but invisible, which read as "the
  sketch does not load." The provider is now a `display: contents` theme pin (its
  colour variables still cascade) with the flex layout on a real element nested
  inside it. Regressed in 1.14.0.

## 1.14.0

### Changed

- **Blit's chrome is now the real Fluent 2 design system.** The hand-authored
  `--fluent-*`/`.bf-*` skin is gone; the command bar, panels, workbench card,
  drawer and dialogs are real `@fluentui/react-components` v9 components — the
  same library the host shares as a Module Federation singleton — coloured by the
  theme's `tokens.*` through Griffel rather than a bespoke stylesheet. Behaviour,
  routes and layout are unchanged.
- **A violet brand of Blit's own.** A `BrandVariants` ramp seeded from violet at
  Fluent's primary slot, declared once in `client/lib/blitTheme.ts`, turned into a
  light and a dark theme and scoped to Blit's subtree by a `<FluentProvider>`, so
  it themes Blit and not the host shell. It follows Core's `data-theme` signal in
  light, dark and OLED.
- Icons are now `@fluentui/react-icons`, matching the Fluent chrome; the
  `lucide-react` peer dependency is dropped. The pixel-art canvas, the sprite
  preview and CodeMirror's syntax palette are deliberately left untouched.

## 1.13.0

### Fixed

- **A sketch in a Strudel pane runs at the speed it was written at.** It was
  stepped by the visual loop's own frame counter, which ticks once per display
  refresh, so a sketch at the default `fps(12)` ran five times too fast on a
  60Hz screen and ten times too fast on a 120Hz one — and skipped frames under
  load instead of slowing down. The pane now derives the sketch's frame from the
  transport time and the sketch's own `fps()`.
- **A pane starts its sketch at frame 0**, however long the set has been
  running. A pane opened an hour in used to start at frame 43,200, which a
  once-through sketch had long since finished.
- **A sketch can be a function of note length.** Notes reaching a pane carried
  only the moment they began, so every note looked instantaneous. They now carry
  the point they end at too, never behind the point they began at.

### Changed

- The Strudel pane message version is **2**, for the note-end field above. This
  release and Strudel 1.17.0 must be installed together: either one alone leaves
  a Blit pane showing a version-mismatch sentence naming both numbers.

## 1.12.0

### Added

**A sketch can be a function of the music.** A sketch now has the track in
scope: bass, mid and treble, the overall loudness, the raw analyser bins, and the
events actually sounding this instant with their sound name, note and gain. A
sprite that grows on the kick, a palette that turns over with the transport, a
field that bends to the bass — all of that is ordinary code now, written with the
same operators as everything else.

The reactive read goes inside `live()`, and that is worth knowing before writing
the first one. A sketch body runs once per EDIT, not once per frame, so a level
read at the top of the file is sampled when you press Ctrl+Enter and frozen from
then on: it would read as reactive in the source and render as a still, with no
error and nothing for the lint to point at. `live((a) => ...)` moves the read
inside the frame, where it is re-read by construction rather than by you
remembering. It costs one rebuild per frame however many pixels the canvas has.

`.onBeat(transform, hold)` is the same idea for the discrete half: apply a
transform on an onset and for `hold` seconds after it. Seconds rather than
frames, because a sketch runs at its own `fps()` and the music does not.

Handing a sketch the EVENTS rather than a picture of them is the whole design. A
toolkit built on shaders would pass the other program's rendered image through a
filter, because filtering an image is what a shader does. Blit composes its own
pixels out of an algebra, so note names and gains are what a sprite can actually
be a function of.

Nothing anybody already saved moved by a pixel. Without music the frame is
silence — every level zero, no events, one frozen shared value — so every stored
sketch renders byte for byte what it rendered before, in the editor, the
spritesheet and every export. The gallery is rendered twice on every test run,
under silence and under a loud frame, and the two are compared.

**A Blit sketch can play in a pane of Strudel's DJ layout, drawing to whatever is
playing there.** Pick a sketch in that surface's channel picker and it renders in
the pane, on the same clock as the music, reacting to it through the fields
above. The sketch is still yours and still lives here: what the other plugin gets
is the renderer and a list of your own sketches, both read with your own session,
and a sketch belonging to somebody else answers 404 there exactly as it does
here. No components, no iframe, no credential crosses in either direction.

This half is pull-based and inert on its own: nothing asks Blit for a channel
until that surface ships, and until then the handler is simply never called.
Because the pane renderer is a built bundle rather than the page's own code, an
engine change reaches a pane through a build and an install rather than through
the dev server — which build drew a pane is readable, so a skew looks like what
it is instead of a caching bug. `docs/interface.md` has the seam.

### Fixed

**Checking a sketch catches a name the language already binds.**
`const grad = ...` at the top level of a sketch cannot compile: every name in the
language is a parameter of the function a sketch compiles to, so declaring one is
a redeclaration. Running it said so immediately; checking it without running it
did not, and worse than not reporting the collision, it was silenced by it — the
name check counted that declaration as a binding and then skipped every reference
to it, so the one mistake guaranteed to fail was the one mistake that turned the
checker off. A sketch came back green and hard-failed the next time anybody
opened it. `POST /api/blit/lint` and `blit_lint_sketch` now report it as an error
with the name in it, which matters most for an agent writing a sketch it cannot
see. Inside any nested scope the name is still yours.

## 1.11.1

### Fixed

**A zoomed sprite bigger than the stage can be scrolled to its edges.** Past the
point where the picture stopped fitting, the top and left of it went behind the
workbench card and there was no way to get them back: the scrollbar covered only
about half the excess, and scrolling home still left the sprite's first row and
first column off the edge.

The stage centred the picture with flexbox — `justify-center` and `items-center`
— which is correct until the picture is larger than the box. Then centring puts
HALF the overflow at each end, and a scroll container can only ever reach the end
of its content: whatever hangs off the start edge is unreachable by construction,
and the browser does not count it in `scrollWidth` either, which is why the
scrollbar looked like it had the whole picture when it had half of it. The
picture now centres with auto margins, which collapse to zero the moment the free
space goes negative — centred while it fits, scrollable end to end when it does
not. Stacked, side by side, at any splitter position and on the narrow layout.

**Zooming keeps the middle of the view put.** Going from 2x to 16x used to leave
the scroll offset where it was while the picture grew around it, which drops you
in the sprite's top-left corner; it now enlarges what you were already looking
at, the way any image viewer does. Opening a sketch, or a change to `size()`,
starts in the middle of the new picture rather than at a position that meant
something in the old one.

**The deepest zooms on the largest canvases draw instead of coming back blank.**
`size(512, 512)` at 16x asked the browser for a 16384-square canvas on a retina
screen — over a billion pixels, past what one can allocate, and a canvas that
fails to allocate simply renders nothing with no error anywhere. The backing
store is now budgeted, and when it has to drop it drops to a whole division of
the zoom, so the browser's own upscale stays an integer and every sketch pixel
stays the same size as its neighbours.

The canvas's CSS size moved out of the animation loop and into the markup, so
the scroll port measures the picture on the commit that changed it rather than an
animation frame later.

## 1.11.0

### Added

**Zoom is saved with the sketch.** It used to be a page-lifetime setting: every
sketch you opened arrived at whatever zoom the last one had left behind, and a
reload forgot it entirely. It now lives on the sketch row, written by Save and by
`Ctrl`/`Cmd` + `S` along with the name and the text, so a sketch comes back at the
zoom you left it at — on any machine you open it on, not just the browser that
set it.

Per sketch rather than per browser, because it is not one answer for every
sketch: a 128x128 import and a 16x16 icon are not looked at from the same
distance, and a single remembered value would be wrong for whichever you opened
next. That is also why it is a column rather than a `localStorage` key, where the
panel widths and the workbench split legitimately live — those describe the
window, and this describes the sketch.

Zoom is the one view setting a sketch cannot declare. `size()`, `fps()` and
`cycle()` are in the code and deliberately have no column, because a control that
could disagree with the source would give the same fact two homes; how closely
you are standing to the canvas has no home in the source at all.

Changing the zoom therefore reads as **unsaved**, the same as changing the text,
and the API stores only the six steps the chips offer — a stored 5 would open with
no chip lit and nothing to click to get back to it. `create_sketch` and
`update_sketch` take it too, for an agent that knows the art it just wrote wants
1x.

### Changed

**A sketch opens at 2x, not 8x.** 8x meant a big grid arrived cropped by the
stage and had to be zoomed out before it could be looked at, which is the wrong
way round: 2x shows the whole thing, and anything that wants to be closer now
remembers that it does. Sketches saved before this release open at 2x once, and
keep whatever you save next.

One consequence worth knowing: the pixel grid only draws from 6x, so at the new
default the Pixel grid switch has nothing to show until you zoom in.

## 1.10.1

### Fixed

**A sketch that declares a name the language already owns now says so.** Every
API name is a parameter of the compiled function, so `const grad = (a, b) => a;`
is a redeclaration and the sketch genuinely cannot run. That part was fair; the
report was not. Both compile forms fail here, and the fallback always told the
user about the expression form's failure — which for a sketch of statements is
always `Unexpected token ';'`, about a semicolon that was perfectly fine, with no
line number, because the raw buffer is valid JavaScript on its own and the
grammar had nothing to add. The real reason sat in the other error the whole
time.

It now reads `'grad' is already part of the language, so a sketch cannot declare
it. Rename it.`, on the line that declares it — found by walking the buffer for
the declaration, since the engine's error carries no position.

The same fallback was wrong more generally: whenever the expression form fails
only at the first semicolon, the statement form is the one that read the sketch
the way it was written, so its error is the one reported. An unclosed call in a
statement sketch now says `missing ) after argument list` on the right line
instead of blaming the semicolon above it. An expression sketch is untouched.

## 1.10.0

### Added

**Export to Aseprite.** A spritesheet is what you hand an engine and an APNG is
what you show a person; the third audience is the pixel artist who wants to keep
working, and handing them a strip to slice by hand was the worst of the three
answers. The new export writes a real `.aseprite` sprite: one frame per frame of
the cycle, each carrying the sketch's own timing, on a layer named after the
sketch and tagged as the loop it is.

**Indexed when the sketch fits a palette, RGBA when it does not.** Blit is a
palette language — characters map to colours, digits index a ramp, `.palShift()`
cycles one — so handing a six-colour sprite over as 32-bit RGBA would throw away
the one structure the artist most wants to keep. The colours are counted first:
up to 256 distinct ones and the file is Indexed, with the sketch's exact colours
as the sprite's palette and index 0 reserved for transparent, which is what keeps
recolouring and palette cycling possible in Aseprite too. Past that — a gradient,
noise, a dithered plasma — it is RGBA, for the same reason the loop is an APNG
rather than a GIF: quantising the sketch would mean the export did not look like
what it exported, and Aseprite's own RGB-to-Indexed conversion is one menu item
away and better than anything that belongs in here. Neither mode is lossy;
indexed files carry the exact RGBA of every colour, partial alpha included.

**Always at natural size**, unlike the loop. Zoom is a way of looking at a
sketch, and baking it into a file meant for a pixel editor would hand over a 4x
bitmap with no way back to the grid worth editing. With no zoom to reduce, a loop
past the memory budget is refused outright rather than quietly shrunk.

No new dependency: the format is a header, a header per frame and a chain of
typed chunks, and the only hard part is the ZLIB stream in a cel, which is the
same `CompressionStream('deflate')` the APNG encoder already uses.

## 1.9.0

### Added

**Words, without drawing thirty-six sprites first.** `text('HELLO')` answers an
ordinary pattern, so a word outlines, tints, centres and animates exactly like
the sprite beside it. Before this, putting a label on a canvas meant hand-drawing
an alphabet as sprite literals — a caps-only set is thirty-six grids before you
can write "GAME OVER", which is precisely the mechanical work the rest of the
language exists to refuse.

**Two fonts, because the canvas is small.** The default canvas is 32 pixels
across, where a five-wide font fits five characters. `3x5` is the caps-only font
that can actually label a sprite and is the default for that reason; `5x7` has
real lowercase, real descenders and every printable ASCII character. `3x5` draws
a lowercase letter with its capital rather than with a guess, because at three
pixels wide there is no room for an x-height shorter than the caps.

The advance is the ink rather than the cell, so `I` takes one pixel and `M` takes
five and `text('HI').w` is 5, not 7. The box reported is the word's own, which is
what makes `.center()` centre the letters instead of a rectangle. A character in
neither font draws as a solid block: a missing character has to be visible as
missing. Options are `font`, `color`, `gap`, `line` and `align`; a newline makes
a line.

Text is not a sprite literal. Its pixels have no home in the source, so clicking
one paints nothing, the same as `grad()` or `noise()`.

**The canvas and the editor resize, and can sit side by side.** The split between
them was a fixed 2:3 for as long as the card has existed. It now has the same
Fluent splitter the side panels use — drag it, or focus it and use the arrow keys
in 8px steps, 32px with Shift; double-click or `Home` puts it back. The
arrangement is a choice in the Inspector's View section: stacked, as before, or
two columns.

Side by side is for a wide screen and a tall sketch, where a 64x64 canvas at 8x
is taller than half a window and stacked leaves the editor a slot. **Each
arrangement remembers its own split**, because they are not the same question and
switching arrangement should not undo the sizing you just did. The split is kept
as a fraction of the card rather than a pixel height, so resizing the window moves
both panes instead of making the editor absorb the whole change, and neither pane
can be dragged below 15%.

Below roughly 768px there is one arrangement that fits, so the narrow layout stays
stacked and does not show the control. The choice is remembered rather than
overwritten: a phone does not get to decide what the desktop looks like.

## 1.8.0

### Added

**PNGs up to 1024x1024, with the size to import at as a choice.** The file limit
and the grid limit are now two different numbers, and they were always two
different things. A sprite literal is one character per pixel, so a grid stops at
128x128 and always will. But pixel art is routinely SHARED at a multiple of the
size it was drawn at — the 32x32 posted as a 512x512, the tileset exported at 8x
so it reads on a phone — and refusing those files refused the common case for a
reason that was about the grid rather than the picture.

**The choice is a bar above the editor**, not a control in the Import section,
because a PNG dropped on the canvas has to reach it with the right panel
collapsed or folded into the drawer. It is the same pattern the restored-draft
notice uses. Each choice shows the grid it would make and, as a muted second
number, the palette that grid would have.

**Those counts are measured, not estimated.** The resize is performed and the
colours counted for every candidate before any of them is offered, which is what
makes the difference between "this is a sprite" and "this is a photograph and
Blit is the wrong tool" visible before you commit to a size rather than after.

**A whole-number upscale comes back exactly.** When the image is a scaled-up copy
of a smaller one, that smaller size is offered and flagged as losing nothing:
sampling at it recovers the sprite somebody actually drew, byte for byte. This is
the case the feature mainly exists for.

**The resize runs on the server** (`POST /api/blit/import`), and is
nearest-neighbour only. Every other filter, box through Lanczos, computes a
weighted average, and an average of two colours is a third colour that was in no
pixel of the file. On a photograph that is the point; here it would invent palette
entries, blow the 35-colour cap in one step, and lose the exactness the whole
importer rests on. Picking pixels keeps the palette a subset of the file's, so
"nothing is approximated" still holds of every colour that reaches the grid.

**A sixth MCP tool, `blit_import_png`.** A PNG in, sprite source out, which is
the move an agent handed a reference image had no other way to make. Two steps by
design: ask what the sizes are, then ask for one. A refusal is a 200 carrying the
options, because "at 128 this has 4213 colours" is the measurement that was asked
for and an error would throw the rest of the answer away with it.

### Fixed before it shipped

**A malformed upload was a 500.** `decodePngBytes` was written for the browser,
where every failure it has is something to show a person, so it throws a plain
`Error` — which over HTTP is an Internal Server Error, logging the caller's bad
file as a fault of this server and telling them nothing. The route now converts
those to 400s and reuses the wording verbatim. Found by the route test, not by
reading it.

## 1.7.0

### Added

**Import a PNG as a sprite grid.** You could get a frame out and you could not
bring a reference in, so tracing or deriving from an existing 16x16 was closed
off. Drop a PNG on the canvas, or use Import in the right panel.

**It produces source, not a layer**, and that is the whole justification. Blit is
not a pixel editor and an importer that made an opaque bitmap would be trying to
turn it into one. What comes back is a `sprite()` grid and the `.pal()` binding
its characters: ordinary code, which is how a hand-drawn sprite becomes a family,
a walk cycle, or a dithered variant. An empty buffer gets a whole sketch and
takes its name from the file; a buffer with work in it gets the expression at the
cursor. Either way it is one undo step, so nothing is at risk.

**Characters are chosen to be read.** A colour near one of the letter mnemonics
borrows that letter, so white is `w` and red is `r`, with the exact colour bound
alongside; a letter is left unbound only when it already means exactly that
colour. Only an opaque colour may borrow a letter, because a half-transparent
blue is not `b` however close the hue is.

**Nothing is approximated**, which is what makes the round trip exact: evaluate
the emitted source, render it at the image's size, and you have the file back.
Refusals rather than fudges follow from that, each naming the number that caused
it: up to 128x128 and up to 35 colours. A photograph is hundreds of colours and
would come back as unreadable source, and reducing its palette is a decision only
its author can make.

### Fixed before it shipped

**The decode does not use a canvas.** The obvious route is `createImageBitmap`
and a 2D canvas, and it is wrong here: a canvas stores colour premultiplied by
alpha, so `#3b5dc980` came back as `#3c5ec980`. Measured in Chrome on the first
browser run of this feature, from the emitted `.pal()`. It now decodes the PNG
bytes through `@client/png-codec/pngDecode`, which answers straight alpha. Two
consequences worth stating: the import is PNG only, since JPEG and WebP would
need the canvas back and neither is a pixel-art interchange format; and the whole
decode path is DOM-free, so it is unit-tested rather than only browser-tested.

**The colour cap is the character pool's size, not a number.** It was 48, and an
image of 48 near-black greys ran the pool dry: a mnemonic is only awarded when a
colour happens to be near one, so the mnemonics are headroom and the pool alone
is capacity. Derived from the pool now, so growing one raises the other.

## 1.6.1

### Fixed

**The advertised operator list included `Pat`'s own internals.** `withMod` is
private in TypeScript and ordinary on the prototype at runtime, so reading the
operators off the class handed it to every caller of `POST /api/blit/lint` as part
of the language. Filtered out of what is OFFERED only: a sketch that calls it is
still accepted and still chains, because reporting a method that genuinely exists
would be the check being wrong about the code.

Found by calling the tool rather than by reading it — the list came back with 32
entries where the language has 31.

## 1.6.0

### Added

**An agent can now author a sketch.** Five MCP tools over routes that already
existed: list, get, create and update a sketch, and check one. Blit was
human-only — `module.json` declared no tools at all — while every other authoring
surface in this stack could be driven by an agent.

**`POST /api/blit/lint`, and it is the point of the release.** A person writing a
sketch has the gutter, the canvas and a line number; an agent writing one through
the API has none of that, so its only previous option was to save something broken
and wait for somebody to open it. The route reports syntax errors, names that are
neither in the language nor declared by the sketch, operators a pattern does not
have, and statement-form sketches that never call `out()` and so can never draw
anything — each with a 1-based line and column.

**It parses; it never runs.** This is the only part of the language that executes
on the server, and Blit's promise is that a sketch is evaluated in the tab of the
person who typed it. So the check asks the Lezer grammar the same question the
editor's highlighter asks and reads names off the tree. A syntax error's POSITION
is therefore exactly the editor's; its WORDING is not, because the editor quotes
V8 and there is no engine on this path.

**Every answer carries the language.** `vocabulary` (the global names in scope)
and `operators` (the methods that answer another pattern) come back with every
lint, read off the evaluator's own scope object and the `Pat` class rather than
written out beside them. A caller with no browser has nowhere else to learn what
there is, and a hand-kept list is how a lint starts reporting new operators as
typos.

### Changed

**The sketch scope moved to `client/lib/blit/api.ts`.** `evaluate.ts` keeps the
`new Function`, and now keeps it alone: the lint needs the NAMES of everything a
sketch has in scope and must not be able to reach the evaluator that compiles it.
`SKETCH_NAMES` is read off the real API object, so adding an operator cannot leave
the lint behind. `DEFAULT_SETTINGS` and `SketchSettings` are re-exported from
`evaluate.ts`, so nothing that imported them had to move.

**`unknown-name` is an error only when there is a candidate.** `sprit` for
`sprite` is a typo and is reported as one, with the name. A name with nothing
close is a warning: the check cannot see the page the sketch will run in, and a
lint that rejects working code gets turned off.

### Fixed

**The spec no longer claims that an unowned sketch is readable by everyone.**
`BlitSketch.user_id` was documented as grandfathering rows written before
ownership existed. The route has never done that — `ownedSketch` matches the owner
exactly, and a Blit sketch is source that runs in the reader's tab.

### Not added

**No delete tool.** It destroys a drawing and there is no trash. `GET /status` is
likewise excluded: an agent that can call a tool already knows the plugin is up.
Both are marked `"x-mcp": false` in the spec, so the omission is a decision on the
record rather than something to be discovered.

## 1.5.0

### Added

**Export the loop as one file that plays.** A spritesheet is the right artifact
to hand an engine and the wrong one to show a person, and there was no other way
to get an animation out.

**APNG, not GIF**, and the sketches are the reason. A GIF carries a 256-colour
table and one bit of alpha; `grad`, `noise` and a dithered plasma routinely make
thousands of colours, and `.tint`, `.shadow` and `.off` make genuinely partial
alpha. Quantising all of that would mean the exported loop did not look like the
sketch, which is a strange thing for an export to do. APNG is full RGBA, and
because it is a valid PNG it animates in a browser and still shows its first
frame anywhere that does not know about it — so the file is named `.png`.

No new dependency. The only hard part of writing a PNG is the deflate, and
`CompressionStream('deflate')` is already in the browser and already emits the
zlib-wrapped stream IDAT wants; the rest is chunk framing and a CRC table.

The loop is held in memory whole while it encodes, so the export reduces the zoom
to whatever fits an eight-million-pixel budget, and refuses outright — naming the
frame count and the canvas size — only when even natural size will not fit. Zoom
multiplies cost by its square, so reducing beats refusing.

The encoder is tested by parsing back what it wrote: every CRC verified, the
chunk order checked against the spec, the shared fcTL/fdAT sequence checked for
gaps, and the deflated pixels inflated and compared byte for byte with what was
rendered. Confirmed independently with a decoder outside the project (8 frames,
83ms, RGBA with alpha spanning 0 to 255) and in Chrome, by screenshotting the
image twice and seeing it move.

## 1.4.0

### Added

**A real transport.** The README's pitch is that timing is the one place live
coding beats clicking, and the animation was the least equipped part of the UI:
the frame counter was a ref nothing could subscribe to, so nothing on screen told
you which frame you were looking at, and there was no scrub, no step backwards and
no keyboard transport. You could not hold frame 5 and paint on it.

- **A readout of `slot / cycle`** in the command bar — the position in the loop,
  which is what `frames()`, `.seq()` and `.every()` key off. The absolute frame
  and the cycle index are in its tooltip.
- **A scrub** along the cycle, keyboard-operable, which keeps its own arrow keys
  rather than handing them to the toolbar's roving focus.
- **Step back**, the mirror of Step, clamped at frame 0.
- **`Space` plays and pauses, `.` and `,` step.** After the typing guard, so none
  of them fire mid-word.

The frame counter is now a `FrameClock`: a ref you can subscribe to. It cannot be
React state — the loop advances it up to sixty times a second and a `setState` at
that rate re-renders the editor with it, which is how a live-coding surface starts
dropping keystrokes. Only the readout subscribes, and React re-renders a
subscriber rather than its parents, so the number on screen tracks the animation
while nothing else is touched. There is a browser test that types a long string
while the sketch animates and checks not one character was dropped.

Seeking pauses, including both step keys: a frame you stepped to and then lost a
tick later is not a frame you got to look at. The slot is derived from the
absolute frame with a modulo rather than stored, which is what makes a sketch
shortening its own `cycle()` under a held frame safe — there is nothing to clamp.

Space is guarded on what has focus. That guard's real job turned out to be
narrower than expected and is documented where it lives: it is not what stops a
double-toggle (`preventDefault` already does), and it is not what protects a
focused switch (`shouldIgnoreKey` already does). It is what makes Space on a
focused Step or Reset press THAT button instead of toggling playback.

### Changed

The frame readout that used to sit under the canvas is gone; the command bar owns
it now. Two places showing the same number is two places to disagree.

## 1.3.0

### Added

**Failures now say which line.** `BlitError` carried a message and a phase and
threw the position away, so a stray bracket in forty lines was "Unexpected token
')'" and a hunt. The message now names the line, and the editor marks it in the
gutter through `@codemirror/lint`.

Getting there turned up something the plan had wrong. A runtime throw does carry a
position in its stack, as expected. **A `new Function` SyntaxError carries none at
all** — no `lineNumber`, no `<anonymous>` frame, a stack pointing at the caller —
which was measured rather than assumed. So the two phases get their positions from
different places:

- **Runtime and draw-phase** failures are read out of the stack. The raw line is
  relative to the whole function the engine generated, so two offsets come off it
  first. The prologue offset is COMPUTED from the body strings, so changing them
  cannot silently shift every reported line; the engine's wrapper offset is
  MEASURED once by compiling a probe that throws on a known line, because two
  lines is V8's shape today and not a promise.
- **Parse** failures get their position from the Lezer JavaScript grammar — the
  same parser CodeMirror is already running on the buffer, so it is free and
  cannot disagree with what the editor thinks the code is. It is asked for the
  first place it could not continue, which for a half-typed chain is the end of
  what you typed.

Nothing is reported that cannot be stood behind: a non-V8 stack format, a position
inside the wrapper, or a grammar with no complaint all yield no line rather than a
guess, because a gutter marker on innocent code is worse than no marker.

`Sketch` now carries the `form` it compiled as, which is what lets a throw during
the draw loop be located at all.

## 1.2.0

### Added

**Unsaved work survives a reload.** The editor buffer lived only in React state,
so a refresh threw it away while the toolbar was actively badging it "edited" —
panel widths persisted and the sketch did not. Blit is somewhere you type
experimentally, which made this the most expensive thing in the plugin to lose.

- The buffer is now kept in the browser as a per-sketch draft while it differs
  from the version it was opened from, written half a second after you stop
  typing and removed again the moment the two agree.
- A restored draft is announced in a bar above the editor, never reinstated
  silently, with **Discard** to go back to the text it was typed on top of.
- A draft records the text it was typed ON, so the case where the sketch was
  saved elsewhere in the meantime is distinguishable: the draft is still
  restored, because the unsaved keystrokes are what is at risk, and the bar says
  it is no longer a change on top of what is saved.
- Drafts are cleared on save (under both the `new` key and the sketch's own, so a
  first save cannot hand its draft to the next new sketch) and on delete.

Every access is guarded the way `panelState` is: a private window, blocked site
data or a full quota degrades to exactly the old behaviour rather than failing
the editor's mount.

## 1.1.1

### Fixed

A pass over the Fluent chrome for the things that were plainly wrong on screen,
which measuring against tokens had not caught.

- **Icons rendered at 24px inside their 16px and 20px boxes.** The box was sized
  and the glyph inside it was not, so every icon overflowed by half, ate the gap
  to its label and collided with the text: `+New` had no space in it at all.
  Their stroke weight is now scaled for the box too, since lucide's default is
  drawn for a 24px glyph and shouts at 20px.
- **No base font size on the Fluent scope**, so anything without an explicit size
  inherited the host's 16px and sat a step larger than the 14px Fluent text
  beside it. The base is now Fluent's 14px/20px.
- **A ragged left margin in both panels**: titles at 16px, body at 12px, nav rows
  at 20px. Every left edge inside a panel is now 12px.
- **The sketch name field grew to 750px** as the command bar's only flexible
  member, so its Fluent underline read as a rule across the toolbar. It is capped
  at 240px and a spacer takes the slack, which also puts the state badges at the
  far end where they belong.
- **The canvas and the card were one step apart on Fluent's dark ramp**, so the
  three zones merged into one field and nothing read as raised. Two steps now,
  with a lighter card edge.
- Rows and section spacing were far too airy: a two-line row was 48px before its
  own padding. Nav rows are 32px minimum and grow to fit.
- Read-only sketch facts and the Pixel grid label were different sizes in the
  same panel; both are 14px. Export buttons fill the panel width and align their
  labels, instead of being stranded mid-column.

## 1.1.0

### Changed

- **Blit's chrome is now Fluent 2**, the design Office and Teams use, with
  Strudel's Studio as the reference. The command bar, both side panels, the
  workbench card the canvas and editor sit in, and the phone drawer are Fluent, in
  its light, dark and OLED values, all driven off Core's own theme so switching the
  host theme switches Blit with it. The code keeps its editor theme: syntax colours
  are the one surface a second palette would fight.

  This is a deliberate, bounded exception to Core's chrome, the same one Strudel
  makes: 32px commands instead of the 22px cap, Fluent's blue brand instead of the
  monochrome accent, Segoe UI instead of Figtree. Fluent's palette is declared
  exactly once, in `client/styles.css` between the `fluent-tokens` markers, and
  only `.bf-*` rules read it. `client/lib/blitIdentity.test.ts` enforces that, plus
  four more bounds: no component hard-codes a Fluent value, light and OLED key off
  the host's `data-theme` rather than a preference of Blit's own, the editor keeps
  its theme, and Blit never imports Strudel's copy. The design-system lint exempts
  that one block and nothing else.

- The command bar reads in Fluent's order: transport, then file actions, then the
  sketch's name, with the `edited` and `unsaved` badges at the far end. It is one
  tab stop rather than eight, with the arrow keys moving along it and wrapping;
  the name field keeps its own arrows, since there they move the caret.

- The narrow layout's drawer now comes in from the right over a dimmed page,
  Fluent's shape, instead of up from the bottom. Tapping the dimmed area closes it.
  It no longer repeats the panel's name above it, so each panel is titled exactly
  once wherever it appears.

- Panels no longer sit in cards. They sit on the tinted canvas and are told apart
  from the middle by that card's own edge and shadow.

- All of Fluent's motion here is decoration, so a reduced-motion preference drops
  it outright rather than shortening it.

### Fixed

- The panel collapse button sat on top of the Sketches header's **New** button and
  swallowed its clicks. It is now handed to the panel and rendered inside the
  header beside New, which is where Fluent puts it anyway. Found in the browser;
  nothing about the markup read as wrong.
- An unchosen zoom or palette chip carried no `aria-pressed` at all, so a screen
  reader heard six ways to set the zoom with no indication that one was already on.

## 1.0.5

### Added

- `Ctrl`/`Cmd` + `S` saves the sketch, from anywhere on the page: inside the
  editor, from the canvas, and from the sketch name field. It is the one chord
  that fires while a text field has focus, since typing a name is exactly when
  you reach for it. The browser's own "save this page" dialog is suppressed, and
  `Ctrl`/`Cmd` + `Shift` + `S` is left alone because that is Save As everywhere
  it exists. Holding the chord cannot queue a second save, so a new sketch cannot
  be created twice.

  The editor reads the chord through a `keydown` handler rather than a `Mod-s`
  keymap entry, because CodeMirror matches a binding against the unshifted name
  of the key as well: a `Mod-s` entry also fires on `Ctrl`/`Cmd` + `Shift` + `S`,
  and the editor would have swallowed Save As. Both surfaces now share one
  predicate, so they cannot disagree about what the chord is.

## 1.0.4

### Fixed

- A sketch's code was compiled in sloppy mode, so an undeclared assignment such
  as `wdith = 32` silently succeeded: it did nothing to the sketch and set a
  property on the browser window instead. A typo therefore looked like Blit
  ignoring a setting, and several names a pixel sketch would plausibly reach for
  (`name`, `status`, `origin`, `length`, `close`) are real and load-bearing
  properties of `window`. Sketches now run in strict mode and the undeclared name
  is reported as a **didn't run** error, with the name in the message. Both
  compiled call shapes carry the directive, not just the statement form.
- An animated sketch started playing on load even when the viewer's system asked
  for reduced motion. Blit now opens paused on frame 0 in that case, with the
  sketch evaluated and the canvas drawn, and Play works as it always did. The
  preference is read once at mount, so pressing Play is not then overridden.

## 1.0.3

### Fixed

- `Ctrl`/`Cmd` + `Z` did not undo a painted pixel, only a typed edit. The paint
  was in the undo history all along, and focusing the editor and pressing the
  chord reverted it: the canvas takes no focus, so after a click the keystroke
  went to the BODY and CodeMirror's history keymap, which is bound to the
  editor's own DOM, never saw it. The page now forwards that one chord (and redo,
  in all three spellings) to the editor's own keymap, so painting and typing
  share one history. Nothing is forwarded except undo and redo, or the canvas
  would become a second text input.
- Two separate paint clicks in quick succession collapsed into a single undo
  entry, so one press of `Ctrl`/`Cmd` + `Z` removed both marks. Paints are now
  written through the editor with a history boundary at each gesture, so a click
  or a drag is one undo entry regardless of how fast it was made. Verified in a
  real browser, since this is focus and keymap behaviour that a unit test cannot
  observe; the chord matching itself is unit tested.

### Changed

- `@codemirror/commands` is now a declared peer dependency. It was already in the
  tree, and the history boundary above comes from it.

## 1.0.2

### Fixed

- 1.0.1 rendered the toolbar's `edited` and `unsaved` state with the host's
  `badge-warning` class. The host defines that class, but under
  `@layer components`, and nothing in the host's own source uses it, so Tailwind
  purges it: it appears zero times in every CSS chunk the host serves. The pill
  had a border radius and no colour, which is exactly the
  compiles-to-nothing failure the rule against unknown badge classes exists to
  prevent. Both pills are now built from token utilities this plugin's own
  Tailwind emits, and the design lint rejects every `badge-*` modifier rather
  than only the undocumented ones.

## 1.0.1

Fixes from the post-release plugin audit. No language or API changes.

### Fixed

- `client/styles.css` carried no `@tailwind utilities;`, so the plugin shipped
  none of its own utility classes and silently borrowed whichever ones the host's
  bundle happened to contain. Anything the host never uses rendered as nothing:
  the column resize handle had no resize cursor, the stacked canvas/editor split
  lost its 2:3 ratio, and on the narrow layout the drawer was unpositioned and
  unbounded. Eight classes were dead.
- A sketch row with no owner was readable, writable and deletable by any
  authenticated user. No code path could create one, but a Blit sketch is
  executable source that runs in the reader's own tab, so the ownership filter no
  longer has a null-owner arm and the UPDATE and DELETE writes repeat the
  predicate their read used.
- `PATCH /sketches/:id` merged a partial patch against a row it had read in a
  separate statement, so two saves of the same sketch arriving together could
  lose one. The read, the merge and the write are now one transaction.

### Changed

- Design system: status is a badge pill rather than loose coloured text;
  structural icons sit on the `text-icon` token; labelled chrome buttons are
  22px and the toolbar row is one height throughout; the drawer layer uses the
  named `z-drawer` token and a shadow token; the sketch list gets a row-shaped
  loading skeleton and an action in its empty state; Save and the export buttons
  show progress instead of only disabling.
- The narrow layout's drawer closes on `Escape`, not only by aiming at its X.
- Palette swatches, zoom steps and row actions reach a 44px target under a
  coarse pointer, without changing the desktop layout's density.
- A saved sketch's delete action is always visible rather than hover-only, which
  gave it no touch equivalent in the drawer.
- Digits that rewrite in place are tabular, so the frame counter and the
  inspector's values no longer reflow.
- Hand-rolled controls draw a focus ring instead of falling back to the UA
  outline.

### Added

- `docs/interface.md`: the editor surface, the keyboard map, and what changes on
  a touch screen.
- `client/lib/designRules.test.ts`: a lint for the DESIGN.md rules that fail
  silently in the browser, every matcher proven against a known violation.

## 1.0.0

First release. A live-coding REPL for pixel art and sprite animation.

### The engine

- A pattern algebra built on one type, `(x, y, ctx) => Color`, with transparency
  as alpha 0 so no operator special-cases a hole. Hand-drawn sprites and
  generated fields are the same type and compose with the same operators.
- ASCII sprite grids as the mini-notation: dedented, blank-line trimmed, ragged
  rows tolerated, with letter mnemonics and digit-indexed ramps.
- Composition (`stack`, `over`, `under`, `shift`, `off`), space (`flip`,
  `mirror`, `rot`, `tile`, `scale`, `crop`, `center`), masking (`mask`, `cut`),
  color (`pal`, `ramp`, `palShift`, `recolor`, `tint`, `outline`, `shadow`,
  `dither`) and time (`fast`, `slow`, `every`, `when`, `seq`, `euclid`,
  `degrade`, `hold`, `jux`).
- Time defined in cycles of frames, so Strudel's time operators port across
  without redesign.
- Seeded, reproducible `noise` and `degrade`.
- `recolor` preserves transparency, so a blanket recolor cannot silently fill
  the background.
- `jux` gives each half its own coordinate space, so both sides render a
  complete copy instead of one sprite split across the seam.
- Six named ramps: `default`, `pico8`, `sweetie`, `gameboy`, `cga`, `ember`.

### Click-to-paint

- Clicking a canvas pixel rewrites the character that drew it, through arbitrary
  chains of mirrors, offsets, rotations, scales and layers.
- Two-pass resolution: the visible pixel's own cell first, then a transparent
  cell inside a sprite's footprint, which is how clicking a hole or an outline
  edge grows the shape.
- The source scanner is a small lexer, not a regex, so a `sprite(` inside a
  comment, a string or an unrelated template literal is never edited.
- Interpolating and runtime-built sprites render but are not clickable, because
  their characters have no stable home in the source.

### The editor

- Explicit evaluation on Ctrl+Enter, with the buffer's `edited` state shown
  rather than corrected.
- The frame counter survives re-evaluation, so an edit refines an animation
  instead of restarting it.
- Ten worked examples, each teaching one idea, verified to evaluate, render and
  stay warning-free.
- Primary and secondary side panels per the house creative-plugin frame, each
  independently collapsible with a persisted, resizable width, folding into a
  drawer on a phone.
- A palette panel measured from a real render pass, so a `.pal()` buried in a
  chain is reported correctly and an unmapped character is surfaced as a warning.
- PNG frame, spritesheet and source export, all client side.

### Storage

- Per-user sketches in the plugin's own database, storing source and nothing
  else. Canvas size, frame rate and cycle length belong to the sketch.
- Another user's sketch answers 404 rather than 403.
- Sketch code is never evaluated on the server.

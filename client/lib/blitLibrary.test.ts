import { describe, expect, it } from 'vitest';

import { createBlitLibrary, matchRef, type LibraryRow } from './blitLibrary';

const rows: LibraryRow[] = [
  { id: 1, name: 'Coin', updated_at: 't1' },
  { id: 2, name: 'Gem', updated_at: 't1' },
  { id: 3, name: 'Gem', updated_at: 't1' },
];

describe('which sketch a reference means', () => {
  it('matches a name exactly, then without regard to case', () => {
    expect(matchRef(rows, 'Coin')).toMatchObject({ id: 1 });
    expect(matchRef(rows, ' coin ')).toMatchObject({ id: 1 });
  });

  it('matches an id', () => {
    expect(matchRef(rows, 2)).toMatchObject({ id: 2 });
    expect(matchRef(rows, 9)).toMatch(/No saved sketch has the id 9/);
  });

  it('refuses a name two sketches share, and says how to pick one', () => {
    expect(matchRef(rows, 'Gem')).toMatch(/2 saved sketches are called 'Gem'.*blit\(2, x, y\)/);
  });

  it('refuses a name nobody has', () => {
    expect(matchRef(rows, 'Nope')).toMatch(/No saved sketch is called 'Nope'/);
  });
});

describe('the library fetches what it is asked for', () => {
  it('answers loading, fetches, then answers the source', async () => {
    const fetched: number[] = [];
    const library = createBlitLibrary(async (id) => {
      fetched.push(id);
      return { name: 'Coin', code: `// v${fetched.length}` };
    });
    const missing = new Set<number>();
    expect(library.resolver(rows, missing)('Coin')).toEqual({ kind: 'loading' });
    expect([...missing]).toEqual([1]);

    await library.load(missing, rows);
    const again = new Set<number>();
    expect(library.resolver(rows, again)('Coin')).toMatchObject({ kind: 'found', source: { id: 1, code: '// v1' } });
    expect(again.size).toBe(0);

    // Saved since: the list's stamp moved, so the cached text is stale.
    const moved = [{ ...rows[0], updated_at: 't2' }];
    const stale = new Set<number>();
    expect(library.resolver(moved, stale)('Coin')).toEqual({ kind: 'loading' });
    await library.load(stale, moved);
    expect(library.resolver(moved, new Set())('Coin')).toMatchObject({ source: { code: '// v2' } });
  });

  it('answers loading for everything until the list has arrived', () => {
    const library = createBlitLibrary(async () => ({ name: '', code: '' }));
    expect(library.resolver(undefined, new Set())('Coin')).toEqual({ kind: 'loading' });
  });

  it('turns a failed fetch into an error, rather than loading forever', async () => {
    const library = createBlitLibrary(async () => {
      throw new Error('500');
    });
    await library.load([1], rows);
    expect(library.resolver(rows, new Set())('Coin')).toMatchObject({ kind: 'error', message: expect.stringMatching(/Couldn't load 'Coin'/) });
  });

  it('fetches a sketch once however many ask at the same time', async () => {
    let calls = 0;
    const library = createBlitLibrary(async () => {
      calls += 1;
      return { name: 'Coin', code: '' };
    });
    await Promise.all([library.load([1], rows), library.load([1], rows)]);
    expect(calls).toBe(1);
  });
});

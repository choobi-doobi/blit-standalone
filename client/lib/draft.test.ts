import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DRAFT_DEBOUNCE_MS,
  NEW_DRAFT_KEY,
  clearDraft,
  draftKey,
  draftRestore,
  readDraft,
  writeDraft,
  type Draft,
  type DraftStore,
} from './draft';

/** A localStorage that works, so the happy paths are real round trips. */
function fakeStore(seed: Record<string, string> = {}): DraftStore & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** The private-window / over-quota store: every access throws. */
const hostileStore: DraftStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('draftKey', () => {
  it('separates an unsaved sketch from every saved one', () => {
    // The `new` slot has to be its own key: sharing one with id 0 would make a
    // brand-new sketch and a saved sketch overwrite each other's drafts.
    expect(draftKey(null)).toBe(NEW_DRAFT_KEY);
    expect(draftKey(0)).not.toBe(draftKey(null));
    expect(draftKey(7)).toBe('blit.draft.7');
    expect(draftKey(8)).not.toBe(draftKey(7));
  });
});

describe('writeDraft / readDraft', () => {
  it('round trips the buffer, the name and what it was typed on', () => {
    const store = fakeStore();
    writeDraft(12, { name: 'Ship', code: 'out(sprite(`ww`));', base: 'out(empty());' }, store);
    expect(readDraft(12, store)).toMatchObject({
      name: 'Ship',
      code: 'out(sprite(`ww`));',
      base: 'out(empty());',
    });
  });

  it('stamps a write so a stored draft is legible to a human', () => {
    const store = fakeStore();
    vi.setSystemTime(new Date('2026-09-19T10:00:00Z'));
    writeDraft(null, { name: 'A', code: 'b', base: '' }, store);
    expect(readDraft(null, store)?.at).toBe(Date.parse('2026-09-19T10:00:00Z'));
    vi.useRealTimers();
  });

  it('reads nothing for a sketch that has no draft', () => {
    expect(readDraft(3, fakeStore())).toBeNull();
  });

  it('treats a corrupt or half-shaped draft as absent rather than repairing it', () => {
    // A draft is the thing standing between the user and losing work, so a
    // record that cannot be trusted whole is not trusted at all.
    expect(readDraft(1, fakeStore({ 'blit.draft.1': 'not json' }))).toBeNull();
    expect(readDraft(1, fakeStore({ 'blit.draft.1': '{"name":"A"}' }))).toBeNull();
    expect(readDraft(1, fakeStore({ 'blit.draft.1': '{"code":"a"}' }))).toBeNull();
    expect(readDraft(1, fakeStore({ 'blit.draft.1': '{"name":1,"code":"a"}' }))).toBeNull();
    expect(readDraft(1, fakeStore({ 'blit.draft.1': 'null' }))).toBeNull();
  });

  it('accepts a draft missing only its metadata, because the text is what matters', () => {
    const draft = readDraft(1, fakeStore({ 'blit.draft.1': '{"name":"A","code":"out(empty());"}' }));
    expect(draft).toMatchObject({ name: 'A', code: 'out(empty());', base: '', at: 0 });
  });

  it('survives a store that throws on every access', () => {
    // Private windows throw on read, a full quota throws on write. Neither is a
    // reason for the editor to fail to mount, so all three degrade silently.
    expect(readDraft(1, hostileStore)).toBeNull();
    expect(() => writeDraft(1, { name: 'A', code: 'b', base: '' }, hostileStore)).not.toThrow();
    expect(() => clearDraft(1, hostileStore)).not.toThrow();
  });

  it('does nothing at all when there is no window to store in', () => {
    // Server-side render, or a test in the node environment: no store, no throw.
    expect(readDraft(1)).toBeNull();
    expect(() => writeDraft(1, { name: 'A', code: 'b', base: '' })).not.toThrow();
    expect(() => clearDraft(1)).not.toThrow();
  });
});

describe('clearDraft', () => {
  it('removes only the draft it was asked to remove', () => {
    const store = fakeStore();
    writeDraft(1, { name: 'A', code: 'a', base: '' }, store);
    writeDraft(2, { name: 'B', code: 'b', base: '' }, store);
    clearDraft(1, store);
    expect(readDraft(1, store)).toBeNull();
    expect(readDraft(2, store)?.code).toBe('b');
  });
});

describe('draftRestore', () => {
  const saved = { name: 'Ship', code: 'out(sprite(`ww`));' };
  const draft = (over: Partial<Draft> = {}): Draft => ({
    name: 'Ship',
    code: 'out(sprite(`wwww`));',
    base: saved.code,
    at: 1,
    ...over,
  });

  it('has nothing to restore when there is no draft', () => {
    expect(draftRestore(null, saved)).toEqual({ kind: 'none', draft: null });
  });

  it('has nothing to restore when the draft only repeats the saved text', () => {
    // This is the state after a successful save. Reporting a restore here would
    // put a notice on screen every single reload, for no change at all.
    expect(draftRestore(draft({ code: saved.code, name: saved.name }), saved).kind).toBe('none');
  });

  it('restores a draft typed on the text that is still saved', () => {
    const result = draftRestore(draft(), saved);
    expect(result.kind).toBe('restored');
    expect(result.draft?.code).toBe('out(sprite(`wwww`));');
  });

  it('reports a draft as diverged when the saved sketch moved on underneath it', () => {
    // Saved from another tab. The keystrokes are still the thing at risk, so the
    // draft is restored either way, but the caller must be able to SAY the saved
    // version changed rather than silently overwriting one side with the other.
    const result = draftRestore(draft({ base: 'something else entirely' }), saved);
    expect(result.kind).toBe('diverged');
    expect(result.draft?.code).toBe('out(sprite(`wwww`));');
  });

  it('notices a renamed-only draft', () => {
    // The name is part of what a save writes, so a rename alone is unsaved work.
    expect(draftRestore(draft({ code: saved.code, name: 'Ship v2' }), saved).kind).toBe('restored');
  });
});

describe('DRAFT_DEBOUNCE_MS', () => {
  it('is short enough to survive a crash and long enough not to write per keystroke', () => {
    expect(DRAFT_DEBOUNCE_MS).toBeGreaterThanOrEqual(200);
    expect(DRAFT_DEBOUNCE_MS).toBeLessThanOrEqual(1000);
  });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});

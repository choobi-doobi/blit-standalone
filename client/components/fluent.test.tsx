// @vitest-environment jsdom
/**
 * The DOM wiring of Blit's command-bar primitives, now on the real Fluent 2
 * library. Three things here are behaviour, not styling, and none of them shows
 * up in a screenshot or a typecheck:
 *
 *  - the command bar is ONE tab stop with the arrows moving along it, which is
 *    the difference between skipping the bar with one press of Tab and eight;
 *  - the arrows are given back to the sketch name field, or the name becomes
 *    uneditable by keyboard;
 *  - a busy command is Fluent's `disabledFocusable`: it stays focusable (so its
 *    tooltip still explains it) but its click does not fire, so a slow Save
 *    cannot run twice and create the sketch twice.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FluentProvider, webDarkTheme } from '@fluentui/react-components';
import { PlayRegular, SaveRegular } from '@fluentui/react-icons';

import { FluentBadge, FluentButton, FluentDivider, FluentTitleField, FluentToolbar } from './fluent';

afterEach(cleanup);

/** The bar Blit actually renders: three icon commands, a rule, then a field. */
function Bar({ onSave = () => {}, saving = false }: { onSave?: () => void; saving?: boolean }) {
  return (
    <FluentProvider theme={webDarkTheme}>
      <FluentToolbar label="Blit commands">
        <FluentButton aria-label="Play" icon={<PlayRegular />} />
        <FluentButton aria-label="Step" icon={<PlayRegular />} />
        <FluentDivider />
        <FluentButton onClick={onSave} busy={saving} icon={<SaveRegular />}>
          Save
        </FluentButton>
        <FluentTitleField aria-label="Sketch name" defaultValue="Ship" />
      </FluentToolbar>
    </FluentProvider>
  );
}

const members = () => [...document.querySelectorAll<HTMLElement>('[data-bf-item]')];

describe('FluentToolbar', () => {
  it('is a toolbar with exactly one tab stop', () => {
    render(<Bar />);
    expect(screen.getByRole('toolbar', { name: 'Blit commands' })).toBeDefined();

    const all = members();
    expect(all).toHaveLength(4); // three buttons and the name field
    expect(all.filter((el) => el.tabIndex === 0)).toHaveLength(1);
    expect(all[0].tabIndex).toBe(0);
  });

  it('moves along the bar with the arrows, and wraps', () => {
    render(<Bar />);
    const all = members();

    all[0].focus();
    fireEvent.keyDown(all[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(all[1]);
    // The tab stop follows focus, so Tab back into the bar returns here.
    expect(all[1].tabIndex).toBe(0);
    expect(all[0].tabIndex).toBe(-1);

    // The rule between groups is not a member: right from [1] reaches Save, not it.
    fireEvent.keyDown(all[1], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(all[2]);
    expect(all[2].textContent).toContain('Save');

    // Left from the first member wraps to the last.
    all[0].focus();
    fireEvent.keyDown(all[0], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(all[all.length - 1]);
  });

  it('leaves the arrows to the name field, where they move the caret', () => {
    render(<Bar />);
    const field = screen.getByLabelText('Sketch name');
    field.focus();
    fireEvent.keyDown(field, { key: 'ArrowLeft' });
    // Focus has NOT moved off the field: taking this chord would make the name
    // impossible to edit by keyboard.
    expect(document.activeElement).toBe(field);
  });

  it('makes whichever member was focused the tab stop', () => {
    render(<Bar />);
    const all = members();
    fireEvent.focus(all[2], { target: all[2] });
    expect(all[2].tabIndex).toBe(0);
    expect(all.filter((el) => el.tabIndex === 0)).toHaveLength(1);
  });
});

describe('FluentButton', () => {
  it('swallows the click while busy, so a slow save cannot run twice', () => {
    const onSave = vi.fn();
    render(<Bar onSave={onSave} saving />);
    const save = screen.getByRole('button', { name: /Save/ });

    // Fluent's disabledFocusable: aria-disabled, not the native attribute.
    expect(save.getAttribute('aria-disabled')).toBe('true');
    expect(save.hasAttribute('disabled')).toBe(false);
    expect(save.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();

    // ...and the same button, not busy, does fire.
    cleanup();
    render(<Bar onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('stays focusable while disabled, which is the point of disabledFocusable', () => {
    render(<Bar saving />);
    const save = screen.getByRole('button', { name: /Save/ });
    // A native `disabled` button cannot be focused and shows no tooltip, so a
    // switched-off command becomes a dead end with nothing to explain it.
    expect(save.hasAttribute('disabled')).toBe(false);
    save.focus();
    expect(document.activeElement).toBe(save);
  });

  it('names an icon-only command by its label and marks it for the roving bar', () => {
    render(<Bar />);
    const play = screen.getByRole('button', { name: 'Play' });
    expect(play.hasAttribute('data-bf-item')).toBe(true);
    // The labelled command carries its text, not just a label.
    expect(screen.getByRole('button', { name: /Save/ }).textContent).toContain('Save');
  });
});

describe('FluentBadge', () => {
  it('renders a different chip for a warning than for the neutral state', () => {
    render(
      <FluentProvider theme={webDarkTheme}>
        <FluentBadge>unsaved</FluentBadge>
        <FluentBadge tone="warning">edited</FluentBadge>
      </FluentProvider>,
    );
    const [neutral, warning] = [...document.querySelectorAll('.fui-Badge')];
    expect(neutral.textContent).toBe('unsaved');
    expect(warning.textContent).toBe('edited');
    // Tone drives Fluent's appearance/colour, so the two chips cannot look the
    // same: a badge that ignored `tone` would style them identically.
    expect(neutral.className).not.toBe(warning.className);
  });
});

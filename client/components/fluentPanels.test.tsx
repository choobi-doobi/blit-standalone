// @vitest-environment jsdom
/**
 * The DOM contracts of the panel primitives, on the real Fluent 2 library.
 *
 * Every one of these is a case where the visual state and the announced state
 * have to be the same fact. A selected row that is only styled is invisible to a
 * screen reader; a skeleton that is only styled is nameless boxes; an error that
 * is only styled is never announced at all. The a11y attribute drives both.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FluentProvider, webDarkTheme } from '@fluentui/react-components';

import {
  FluentMessageBar,
  FluentNavList,
  FluentNavRow,
  FluentSkeletonRows,
  FluentSwitch,
  FluentTag,
} from './fluentPanels';

afterEach(cleanup);

function draw(ui: React.ReactElement) {
  return render(<FluentProvider theme={webDarkTheme}>{ui}</FluentProvider>);
}

describe('FluentNavRow', () => {
  it('announces the open row with the same attribute that styles it', () => {
    draw(
      <FluentNavList>
        <FluentNavRow title="Ship" selected onSelect={() => {}} />
        <FluentNavRow title="Plasma" onSelect={() => {}} />
      </FluentNavList>,
    );
    // The selected style keys off `aria-current`, so the cue and the
    // announcement are the same attribute and cannot diverge.
    expect(screen.getByRole('button', { name: 'Ship' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: 'Plasma' }).hasAttribute('aria-current')).toBe(false);
  });

  it('carries an actions slot only when something is there', () => {
    const { container } = draw(
      <FluentNavList>
        <FluentNavRow title="With" onSelect={() => {}} actions={<button type="button">x</button>} />
        <FluentNavRow title="Without" onSelect={() => {}} />
      </FluentNavList>,
    );
    const [withActions, without] = [...container.querySelectorAll('li')];
    // The delete button rides in an actions slot revealed on hover; a row with
    // no button never renders one.
    expect(withActions.querySelector('[data-bf-actions]')).not.toBeNull();
    expect(without.querySelector('[data-bf-actions]')).toBeNull();
  });

  it('calls back on click', () => {
    const onSelect = vi.fn();
    draw(
      <FluentNavList>
        <FluentNavRow title="Ship" onSelect={onSelect} />
      </FluentNavList>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ship' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('FluentSwitch', () => {
  it('is a real switch the keyboard can reach', () => {
    const onChange = vi.fn();
    draw(<FluentSwitch checked={false} onChange={onChange} label="Pixel grid" />);
    const box = screen.getByRole('switch', { name: 'Pixel grid' });
    expect((box as HTMLInputElement).type).toBe('checkbox');
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reflects the state it is given', () => {
    draw(<FluentSwitch checked onChange={() => {}} label="Pixel grid" />);
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(true);
  });
});

describe('FluentSkeletonRows', () => {
  it('says what is loading instead of rendering nameless boxes', () => {
    const { container } = draw(<FluentSkeletonRows rows={3} label="Loading your sketches" />);
    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByText('Loading your sketches')).toBeDefined();
    // The stencils themselves are decoration and stay out of the tree.
    expect(container.querySelector('[aria-hidden]')).not.toBeNull();
    // Two stencil bars per row: a wide title and a shorter line.
    expect(container.querySelectorAll('.fui-SkeletonItem')).toHaveLength(6);
  });
});

describe('FluentMessageBar', () => {
  it('interrupts for an error and merely reports for anything else', () => {
    const { container } = draw(<FluentMessageBar intent="error">Broke</FluentMessageBar>);
    // `alert` so a failed load is announced when it happens; a warning that is
    // always on screen would be noise if it interrupted.
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    cleanup();
    const warn = draw(<FluentMessageBar intent="warning">Careful</FluentMessageBar>);
    expect(warn.container.querySelector('[role="status"]')).not.toBeNull();

    cleanup();
    const info = draw(<FluentMessageBar>Note</FluentMessageBar>);
    // Info is the default and also reports rather than interrupts.
    expect(info.container.querySelector('[role="status"]')).not.toBeNull();
  });
});

describe('FluentTag', () => {
  it('reports a chosen chip as pressed, which is what styles it', () => {
    draw(
      <>
        <FluentTag selected onClick={() => {}} aria-label="Zoom 4x">
          4x
        </FluentTag>
        <FluentTag onClick={() => {}} aria-label="Zoom 8x">
          8x
        </FluentTag>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Zoom 4x' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Zoom 8x' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps a palette chip own fill, since that fill is the sketch data', () => {
    draw(
      <FluentTag onClick={() => {}} style={{ backgroundColor: 'rgb(228, 59, 68)' }} aria-label="Paint with 'w'">
        w
      </FluentTag>,
    );
    const chip = screen.getByRole('button', { name: "Paint with 'w'" });
    expect(chip.style.backgroundColor).toBe('rgb(228, 59, 68)');
  });
});

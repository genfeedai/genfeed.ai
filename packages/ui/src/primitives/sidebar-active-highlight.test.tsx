// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render } from '@testing-library/react';
import {
  SidebarHighlightGroup,
  SidebarRowHighlight,
  sidebarRowStateClassName,
} from '@ui/primitives/sidebar-active-highlight';
import { createContext, useContext } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface RowsProps {
  readonly active: 'a' | 'b';
  readonly pending: 'a' | 'b' | null;
}

const linkStatus = vi.hoisted(() => ({ pendingRow: null as string | null }));
const RowContext = createContext('a');

vi.mock('next/link', () => ({
  useLinkStatus: () => ({
    pending: linkStatus.pendingRow === useContext(RowContext),
  }),
}));

/** Mirrors the app's link rows: the real row highlight, with next/link's pending state mocked. */
function Rows({ active, pending }: RowsProps) {
  linkStatus.pendingRow = pending;

  return (
    <SidebarHighlightGroup>
      {(['a', 'b'] as const).map((id) => (
        <RowContext.Provider key={id} value={id}>
          <div data-row={id}>
            <SidebarRowHighlight isActive={active === id} />
          </div>
        </RowContext.Provider>
      ))}
    </SidebarHighlightGroup>
  );
}

function visibleRows(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-sidebar-active-highlight]'),
  )
    .filter((element) => element.style.display !== 'none')
    .map((element) => element.parentElement?.getAttribute('data-row') ?? '');
}

const ROW_TOPS: Record<string, number> = { a: 0, b: 40 };

describe('SidebarActiveHighlight', () => {
  const animate = vi.fn();

  beforeEach(() => {
    animate.mockReset();
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: animate,
    });
    // jsdom has no layout: place each row at a fixed top.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        const top =
          ROW_TOPS[
            this.closest('[data-row]')?.getAttribute('data-row') ?? 'a'
          ] ?? 0;
        return {
          bottom: top + 32,
          height: 32,
          left: 0,
          right: 100,
          top,
          width: 100,
          x: 0,
          y: top,
          toJSON: () => ({}),
        };
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(Element.prototype, 'animate');
  });

  it('glides once to the clicked row and does not snap back when navigation lands', async () => {
    const { rerender } = render(<Rows active="a" pending={null} />);

    rerender(<Rows active="a" pending="b" />);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]?.[0]).toEqual([
      { transform: 'translate(0px, -40px)' },
      { transform: 'translate(0, 0)' },
    ]);

    await act(async () => {
      rerender(<Rows active="b" pending={null} />);
    });

    // The active highlight picks up where the pending one stopped: no second glide from row a.
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('shows one highlight in the clicked row once the pending one hands over', async () => {
    const { container, rerender } = render(<Rows active="a" pending={null} />);

    expect(visibleRows(container)).toEqual(['a']);

    rerender(<Rows active="a" pending="b" />);
    expect(visibleRows(container)).toEqual(['b']);

    await act(async () => {
      rerender(<Rows active="b" pending={null} />);
    });

    expect(visibleRows(container)).toEqual(['b']);
  });

  it('gives the previous row its highlight back when navigation never lands', async () => {
    const { container, rerender } = render(<Rows active="a" pending={null} />);

    rerender(<Rows active="a" pending="b" />);
    expect(visibleRows(container)).toEqual(['b']);

    await act(async () => {
      rerender(<Rows active="a" pending={null} />);
    });

    expect(visibleRows(container)).toEqual(['a']);
  });
});

describe('sidebarRowStateClassName', () => {
  it.each([
    [true, undefined, 'text-foreground'],
    [
      false,
      undefined,
      'text-foreground/80 hover:bg-foreground/5 hover:text-foreground',
    ],
    [
      false,
      'text-foreground/50',
      'text-foreground/50 hover:bg-foreground/5 hover:text-foreground',
    ],
  ])('isActive=%s inactive=%s -> %s', (isActive, inactive, expected) => {
    expect(sidebarRowStateClassName(isActive, inactive)).toBe(expected);
  });
});

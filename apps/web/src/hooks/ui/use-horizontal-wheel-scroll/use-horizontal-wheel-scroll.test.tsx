import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  useHorizontalWheelScroll,
  VERTICAL_SCROLL_REGION_ATTRIBUTE,
} from './use-horizontal-wheel-scroll';

function Strip() {
  const ref = useHorizontalWheelScroll<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="strip">
      <div {...{ [VERTICAL_SCROLL_REGION_ATTRIBUTE]: '' }} data-testid="column">
        <span>Card</span>
      </div>
    </div>
  );
}

function setSize(
  element: HTMLElement,
  size: Partial<
    Record<
      'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollWidth',
      number
    >
  >,
) {
  for (const [key, value] of Object.entries(size)) {
    Object.defineProperty(element, key, { configurable: true, value });
  }
}

function renderStrip({
  columnScrollTop,
  stripScrollLeft,
}: {
  columnScrollTop: number;
  stripScrollLeft: number;
}) {
  render(<Strip />);
  const strip = screen.getByTestId('strip');
  const column = screen.getByTestId('column');
  setSize(strip, { clientWidth: 600, scrollWidth: 1500 });
  setSize(column, { clientHeight: 400, scrollHeight: 800 });
  strip.scrollLeft = stripScrollLeft;
  column.scrollTop = columnScrollTop;
  return { column, strip };
}

describe('useHorizontalWheelScroll', () => {
  it.each([
    {
      expectedScrollLeft: 100,
      name: 'moves the strip sideways for a plain wheel over a gap',
      wheel: { deltaX: 0, deltaY: 100 },
      over: 'strip',
      columnScrollTop: 0,
      stripScrollLeft: 0,
    },
    {
      expectedScrollLeft: 0,
      name: 'leaves a column that can still scroll down to the wheel',
      wheel: { deltaX: 0, deltaY: 100 },
      over: 'column',
      columnScrollTop: 0,
      stripScrollLeft: 0,
    },
    {
      expectedScrollLeft: 100,
      name: 'moves on sideways once the column is at its end',
      wheel: { deltaX: 0, deltaY: 100 },
      over: 'column',
      columnScrollTop: 400,
      stripScrollLeft: 0,
    },
    {
      expectedScrollLeft: 900,
      name: 'stops at the right end',
      wheel: { deltaX: 0, deltaY: 100 },
      over: 'strip',
      columnScrollTop: 0,
      stripScrollLeft: 850,
    },
    {
      expectedScrollLeft: 0,
      name: 'leaves a sideways trackpad swipe alone',
      wheel: { deltaX: 80, deltaY: 10 },
      over: 'strip',
      columnScrollTop: 0,
      stripScrollLeft: 0,
    },
  ])(
    '$name',
    ({ columnScrollTop, expectedScrollLeft, over, stripScrollLeft, wheel }) => {
      const { column, strip } = renderStrip({
        columnScrollTop,
        stripScrollLeft,
      });

      fireEvent.wheel(over === 'column' ? column : strip, wheel);

      expect(strip.scrollLeft).toBe(expectedScrollLeft);
    },
  );

  it('lets the page scroll once the strip is at its end', () => {
    const { strip } = renderStrip({ columnScrollTop: 0, stripScrollLeft: 900 });

    expect(fireEvent.wheel(strip, { deltaY: 100 })).toBe(true);
  });
});

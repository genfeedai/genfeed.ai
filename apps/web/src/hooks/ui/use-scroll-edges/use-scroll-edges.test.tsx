import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { useScrollEdges } from './use-scroll-edges';

function Strip() {
  const ref = useRef<HTMLDivElement>(null);
  const { canScrollEnd, canScrollStart } = useScrollEdges(ref);
  return (
    <div>
      <div ref={ref} data-testid="strip" />
      <output>{`${canScrollStart ? 'start' : '-'} ${canScrollEnd ? 'end' : '-'}`}</output>
    </div>
  );
}

describe('useScrollEdges', () => {
  it.each([
    {
      expected: '- end',
      name: 'at the start',
      scrollLeft: 0,
      scrollWidth: 1500,
    },
    {
      expected: 'start end',
      name: 'in the middle',
      scrollLeft: 400,
      scrollWidth: 1500,
    },
    {
      expected: 'start -',
      name: 'at the end',
      scrollLeft: 900,
      scrollWidth: 1500,
    },
    {
      expected: '- -',
      name: 'when everything fits',
      scrollLeft: 0,
      scrollWidth: 600,
    },
  ])('reports more to see $name', ({ expected, scrollLeft, scrollWidth }) => {
    render(<Strip />);
    const strip = screen.getByTestId('strip');
    Object.defineProperty(strip, 'clientWidth', {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(strip, 'scrollWidth', {
      configurable: true,
      value: scrollWidth,
    });
    strip.scrollLeft = scrollLeft;

    fireEvent.scroll(strip);

    expect(screen.getByRole('status')).toHaveTextContent(expected);
  });
});

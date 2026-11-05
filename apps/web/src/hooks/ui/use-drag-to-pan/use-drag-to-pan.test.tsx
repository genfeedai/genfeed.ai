import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { useDragToPan } from './use-drag-to-pan';

function Strip() {
  const ref = useRef<HTMLDivElement>(null);
  useDragToPan(ref, '[data-card]');
  return (
    <div ref={ref} data-testid="strip">
      <span data-testid="gap">Gap</span>
      <span data-card="" data-testid="card">
        Card
      </span>
    </div>
  );
}

describe('useDragToPan', () => {
  it.each([
    {
      expectedScrollLeft: 260,
      name: 'pans with a mouse drag on the background',
      pointerType: 'mouse',
      start: 'gap',
    },
    {
      expectedScrollLeft: 400,
      name: 'leaves a drag that starts on a card alone',
      pointerType: 'mouse',
      start: 'card',
    },
    {
      expectedScrollLeft: 400,
      name: 'leaves touch to the native pan',
      pointerType: 'touch',
      start: 'gap',
    },
  ])('$name', ({ expectedScrollLeft, pointerType, start }) => {
    render(<Strip />);
    const strip = screen.getByTestId('strip');
    strip.scrollLeft = 400;

    fireEvent.pointerDown(screen.getByTestId(start), {
      button: 0,
      clientX: 500,
      pointerId: 1,
      pointerType,
    });
    fireEvent.pointerMove(strip, { clientX: 640, pointerId: 1, pointerType });
    fireEvent.pointerUp(strip, { pointerId: 1, pointerType });

    expect(strip.scrollLeft).toBe(expectedScrollLeft);
  });
});

// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Slider } from './slider';

function ControlledSlider({ changes }: { changes: number[][] }) {
  const [value, setValue] = useState([40]);
  return (
    <Slider
      aria-label="Volume"
      max={100}
      onValueChange={(next) => {
        changes.push(next);
        setValue(next);
      }}
      step={5}
      value={value}
    />
  );
}

describe('Slider', () => {
  it.each([0, 1, 2, 3])(
    'renders one thumb for each of %i controlled values',
    (valueCount) => {
      render(
        <Slider
          aria-label="Range"
          max={100}
          value={Array.from({ length: valueCount }, (_, index) => index * 10)}
        />,
      );

      expect(screen.queryAllByRole('slider')).toHaveLength(valueCount);
    },
  );

  it.each([0, 1, 2, 3])(
    'renders one thumb for each of %i default values',
    (valueCount) => {
      render(
        <Slider
          aria-label="Range"
          defaultValue={Array.from(
            { length: valueCount },
            (_, index) => index * 10,
          )}
          max={100}
        />,
      );

      expect(screen.queryAllByRole('slider')).toHaveLength(valueCount);
    },
  );

  it('names a single thumb by its aria-label and reports its value', () => {
    render(<Slider aria-label="Volume" max={100} value={[40]} />);

    const thumb = screen.getByRole('slider', { name: 'Volume' });
    expect(thumb).toHaveAttribute('aria-valuetext', '40');
  });

  it('reports a key press as a list of values', () => {
    const changes: number[][] = [];
    render(<ControlledSlider changes={changes} />);

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Volume' }), {
      key: 'ArrowRight',
    });

    expect(changes).toEqual([[45]]);
    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveAttribute(
      'aria-valuetext',
      '45',
    );
  });
});

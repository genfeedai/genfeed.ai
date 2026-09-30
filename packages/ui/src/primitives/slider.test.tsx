// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Slider } from './slider';

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
});

import { render, screen } from '@testing-library/react';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import { describe, expect, it } from 'vitest';

describe('MetricCardGrid container density', () => {
  it.each([2, 3, 4, 5, 6] as const)(
    'caps the shared tile ladder at %s columns',
    (columns) => {
      render(
        <MetricCardGrid columns={columns}>
          <span>Metric</span>
        </MetricCardGrid>,
      );
      const wrapper = screen.getByTestId('metric-card-grid');
      expect(wrapper).toHaveClass('@container');
      const grid = wrapper.firstElementChild;
      expect(grid).toHaveClass(
        'grid',
        'gap-3',
        'grid-cols-1',
        '@[24rem]:grid-cols-2',
      );
      if (columns > 2)
        expect(grid).toHaveClass(`@[${columns * 12}rem]:grid-cols-${columns}`);
      expect(grid?.className).not.toMatch(/(?:sm|md|lg|xl):grid-cols/);
      expect(grid?.className).not.toContain(`grid-cols-${columns + 1}`);
    },
  );
});

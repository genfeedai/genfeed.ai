import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DashboardGrid } from './DashboardGrid';

it('uses the shared container-width stat ladder and keeps caller spacing', () => {
  render(
    <DashboardGrid cols={4} className="mt-6">
      <span>Revenue</span>
    </DashboardGrid>,
  );
  const grid = screen.getByTestId('metric-card-grid');
  expect(grid).toHaveClass('@container', 'mt-6');
  expect(grid.firstElementChild).toHaveClass('gap-3', '@[48rem]:grid-cols-4');
});

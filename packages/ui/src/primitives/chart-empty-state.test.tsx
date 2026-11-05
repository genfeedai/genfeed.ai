import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChartEmptyState } from '@ui/primitives/chart-empty-state';
import { describe, expect, it, vi } from 'vitest';

describe('ChartEmptyState', () => {
  it('says why the chart is empty and runs the next step', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ChartEmptyState
        action={{ label: 'Connect accounts', onClick }}
        description="Views split by platform once an account reports them."
        shape="donut"
        title="No platform distribution yet"
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'No platform distribution yet' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Views split by platform once an account reports them.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Connect accounts' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each(['area', 'bars', 'donut', 'line'] as const)(
    'keeps the %s preview out of the accessibility tree',
    (shape) => {
      render(<ChartEmptyState shape={shape} title="No data yet" />);

      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
  );
});

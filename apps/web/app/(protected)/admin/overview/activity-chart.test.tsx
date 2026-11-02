import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ActivityChart from './activity-chart';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

describe('Platform activity chart', () => {
  it('says so when the period has no activity, instead of drawing an empty plot', () => {
    render(
      <ActivityChart
        data={[]}
        isLoading={false}
        onRangeChange={vi.fn()}
        range="7d"
      />,
    );

    expect(screen.getByText('No activity in this period')).toBeInTheDocument();
  });

  it('asks for the 30 day range when the toggle changes', async () => {
    const onRangeChange = vi.fn();
    render(
      <ActivityChart
        data={[]}
        isLoading={false}
        onRangeChange={onRangeChange}
        range="7d"
      />,
    );

    await userEvent.click(screen.getByRole('radio', { name: '30 Days' }));

    expect(onRangeChange).toHaveBeenCalledWith('30d');
  });
});

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RunStatsStrip from './RunStatsStrip';

const stats = {
  active: 2,
  completed: 1200,
  failed: 4,
  total: 1206,
  totalCredits: 5500,
};

describe('RunStatsStrip', () => {
  it('renders loading placeholders for every execution stat', () => {
    render(<RunStatsStrip isLoading stats={stats} />);

    expect(screen.getByText('Total')).toBeVisible();
    expect(screen.getByText('Active')).toBeVisible();
    expect(screen.getByText('Credits')).toBeVisible();
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(5);
  });

  it('renders formatted execution stats', () => {
    render(<RunStatsStrip isLoading={false} stats={stats} />);

    expect(screen.getByText('1,206')).toBeVisible();
    expect(screen.getByText('1,200')).toBeVisible();
    expect(screen.getByText('5,500')).toBeVisible();
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(0);
  });
});

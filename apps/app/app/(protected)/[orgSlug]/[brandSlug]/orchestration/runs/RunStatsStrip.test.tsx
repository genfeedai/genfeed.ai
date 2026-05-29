import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RunStatsStrip from './RunStatsStrip';

describe('RunStatsStrip', () => {
  it('renders loading placeholders for all run stats', () => {
    render(<RunStatsStrip stats={null} isLoading />);

    expect(screen.getByText('Active')).toBeVisible();
    expect(screen.getByText('Top Actual Model')).toBeVisible();
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(8);
  });

  it('renders formatted stats and model fallbacks', () => {
    render(
      <RunStatsStrip
        isLoading={false}
        stats={{
          activeRuns: 2,
          autoRoutedRuns: 3,
          completedToday: 1200,
          failedToday: 4,
          topActualModels: [{ count: 8, model: 'gpt-5.4' }],
          topRequestedModels: [],
          totalCreditsToday: 5500,
          webEnabledRuns: 9,
        }}
      />,
    );

    expect(screen.getByText('1,200')).toBeVisible();
    expect(screen.getByText('5,500')).toBeVisible();
    expect(screen.getByText('gpt-5.4')).toBeVisible();
    expect(screen.getByText('Untracked')).toBeVisible();
  });
});

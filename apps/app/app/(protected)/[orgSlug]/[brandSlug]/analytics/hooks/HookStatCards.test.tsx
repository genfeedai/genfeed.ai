import type { IViralHookAnalysis } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HookStatCards from './HookStatCards';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const analysisData: IViralHookAnalysis = {
  totalVideos: 12,
  topPlatforms: [],
  hookEffectiveness: [],
  topHooks: [{ hook: 'A hook', avgEngagement: 1250, postCount: 4 }],
};

describe('HookStatCards metric definitions', () => {
  it.each([1250, 0])(
    'does not describe average engagement %s as a total',
    (avgEngagement) => {
      render(
        <HookStatCards
          analysisData={{
            ...analysisData,
            topHooks: [{ hook: 'A hook', avgEngagement, postCount: 4 }],
          }}
        />,
      );
      expect(screen.getByText('Best Hook Avg Engagement')).toBeInTheDocument();
      expect(
        screen
          .getByText('Best Hook Avg Engagement')
          .closest('[data-testid="metric-card"]'),
      ).toHaveTextContent(avgEngagement ? '1.3k' : '0');
      expect(
        screen.queryByRole('button', { name: 'About Engagement' }),
      ).toBeNull();
      expect(
        screen.getByRole('button', { name: 'About Posts' }),
      ).toBeInTheDocument();
    },
  );

  it('keeps the missing-average state unannotated', () => {
    render(<HookStatCards analysisData={{ ...analysisData, topHooks: [] }} />);
    expect(screen.getAllByText('N/A')).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'About Engagement' }),
    ).toBeNull();
  });
});

import type { ITrendVideo } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ViralVideoLeaderboard } from './viral-video-leaderboard';

vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  const { default: pages } = await import(
    '../../../../../../apps/app/messages/en/pages.json'
  );
  const { default: ui } = await import(
    '../../../../../../apps/app/messages/en/ui.json'
  );
  return { useTranslations: createTranslateFromCatalog({ pages, ui }) };
});

const video: ITrendVideo = {
  id: 'video-1',
  platform: 'tiktok',
  title: 'External video',
  creatorHandle: 'creator',
  views: 90000,
  engagementRate: 4.5,
  velocity: 10,
  viralScore: 80,
};

describe('ViralVideoLeaderboard metric definitions', () => {
  it.each([video, { ...video, views: 0 }])(
    'keeps external views unannotated while preserving the rate definition: %j',
    (trend) => {
      render(<ViralVideoLeaderboard videos={[trend]} />);
      const viewsHeader = screen.getByRole('columnheader', { name: 'Views' });
      expect(viewsHeader.querySelector('button')).toBeNull();
      expect(screen.queryByRole('button', { name: 'About Views' })).toBeNull();
      expect(screen.getByText(trend.views ? '90.0k' : '0')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'About Engagement rate' }),
      ).toBeInTheDocument();
      expect(screen.getByText('4.5%')).toBeInTheDocument();
    },
  );
});

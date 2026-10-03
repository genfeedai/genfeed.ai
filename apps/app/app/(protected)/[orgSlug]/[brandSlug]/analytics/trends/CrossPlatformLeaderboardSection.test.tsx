import type { ITrendVideo } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CrossPlatformLeaderboardSection from './CrossPlatformLeaderboardSection';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
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

describe('CrossPlatformLeaderboardSection metric definitions', () => {
  it.each([video, { ...video, views: 0 }])(
    'keeps external views unannotated while preserving the rate definition: %j',
    (trend) => {
      render(
        <CrossPlatformLeaderboardSection
          viralLeaderboard={[trend]}
          creatorLeaderboard={[]}
          platformConfigLookup={{}}
        />,
      );
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

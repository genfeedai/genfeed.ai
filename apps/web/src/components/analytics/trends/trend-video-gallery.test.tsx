import { Timeframe } from '@genfeedai/contracts';
import type { ITrendVideo } from '@genfeedai/contracts/interfaces';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TrendVideoGallery from './trend-video-gallery';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/components/analytics/trends/social-media-player', () => ({
  default: ({ title }: { title: string }) => (
    <div data-testid="player">{title}</div>
  ),
}));

function video(id: string, thumbnailUrl?: string): ITrendVideo {
  return {
    creatorHandle: 'creator',
    id,
    platform: 'tiktok',
    thumbnailUrl,
    title: `Video ${id}`,
    videoUrl: `https://example.com/${id}`,
    viewCount: 1000,
  } as ITrendVideo;
}

describe('TrendVideoGallery', () => {
  it('lists only videos that have a thumbnail', () => {
    render(
      <TrendVideoGallery
        isLoading={false}
        onClearHashtag={vi.fn()}
        onVideoClick={vi.fn()}
        selectedHashtag=""
        timeframe={Timeframe.H72}
        videos={[video('a', 'https://cdn.example.com/a.jpg'), video('b')]}
      />,
    );

    expect(screen.getAllByTestId('player')).toHaveLength(1);
    expect(screen.getByTestId('player')).toHaveTextContent('Video a');
  });

  it('shows the empty message when no video has a thumbnail', () => {
    render(
      <TrendVideoGallery
        isLoading={false}
        onClearHashtag={vi.fn()}
        onVideoClick={vi.fn()}
        selectedHashtag=""
        timeframe={Timeframe.H72}
        videos={[video('b')]}
      />,
    );

    expect(screen.queryByTestId('player')).not.toBeInTheDocument();
    expect(screen.getByText('noContent')).toBeInTheDocument();
  });
});

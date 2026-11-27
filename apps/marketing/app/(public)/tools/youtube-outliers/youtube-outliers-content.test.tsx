import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import YoutubeOutliersContent from './youtube-outliers-content';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  find: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@data/app-links', () => ({
  getAppSignUpUrl: () => 'https://app.genfeed.ai/sign-up',
}));

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({ findPublicYoutubeOutliers: mocks.find }),
  },
}));

vi.mock('../../../../src/analytics/posthog-client', () => ({
  captureWebsiteAnalyticsEvent: mocks.capture,
}));

const video = {
  publishedAt: '2026-11-01T10:00:00.000Z',
  ratio: 12,
  thumbnailUrl: 'https://i.ytimg.com/vi/video1/hq.jpg',
  tier: 'breakout',
  title: 'The video that took off',
  url: 'https://www.youtube.com/watch?v=video1',
  videoId: 'video1',
  views: 120000,
};

const ready = {
  baselineSampleSize: 20,
  baselineViews: 10000,
  breakoutThreshold: 10,
  channelId: 'UCabcdefghijklmnopqrstuv',
  channelTitle: 'A channel',
  id: 'UCabcdefghijklmnopqrstuv',
  outlierThreshold: 3,
  outliers: [video],
  status: 'ready',
  videosAnalyzed: 100,
};

async function submit(channel: string) {
  fireEvent.change(screen.getByLabelText('YouTube channel'), {
    target: { value: channel },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Find outlier videos' }));
}

describe('YoutubeOutliersContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the ranked videos with their multiple of the usual views', async () => {
    mocks.find.mockResolvedValue(ready);
    render(<YoutubeOutliersContent />);

    await submit('@achannel');

    expect(await screen.findByText('12x')).toBeInTheDocument();
    expect(mocks.find).toHaveBeenCalledWith('@achannel');
    expect(
      screen.getByRole('link', { name: 'The video that took off' }),
    ).toHaveAttribute('href', video.url);
    expect(screen.getByText('Breakout')).toBeInTheDocument();
    expect(screen.getByText('Calculated by Genfeed')).toBeInTheDocument();
    expect(
      screen.getByText(/not metrics provided by YouTube/),
    ).toBeInTheDocument();
    expect(screen.getByText(/about 10K views/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Remix it in Genfeed' }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up');
  });

  it('says so when no video beats the threshold', async () => {
    mocks.find.mockResolvedValue({
      ...ready,
      outliers: [{ ...video, ratio: 1.4, tier: null }],
    });
    render(<YoutubeOutliersContent />);

    await submit('@achannel');

    expect(
      await screen.findByText(/No video is 3x above this channel/),
    ).toBeInTheDocument();
    expect(screen.getByText('Above average')).toBeInTheDocument();
  });

  it('explains a channel with too few settled videos', async () => {
    mocks.find.mockResolvedValue({
      ...ready,
      baselineViews: null,
      outliers: [],
      status: 'insufficient_data',
    });
    render(<YoutubeOutliersContent />);

    await submit('@tiny');

    expect(
      await screen.findByText(/too few settled videos/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows an error the visitor can act on when the channel cannot be read', async () => {
    mocks.find.mockRejectedValue(new Error('404'));
    render(<YoutubeOutliersContent />);

    await submit('@nobody');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Paste a channel URL such as youtube\.com\/@name/,
      );
    });
  });

  it('does not submit an empty channel', () => {
    render(<YoutubeOutliersContent />);

    expect(
      screen.getByRole('button', { name: 'Find outlier videos' }),
    ).toBeDisabled();
    expect(mocks.find).not.toHaveBeenCalled();
  });
});

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdsPublicDiscoveryPanel from './AdsPublicDiscoveryPanel';
import '@testing-library/jest-dom/vitest';

const state = vi.hoisted(() => ({
  brandId: 'brand',
  organizationId: 'org',
  isReady: true,
}));
const discover = vi.hoisted(() => vi.fn());
const openRemix = vi.hoisted(() => vi.fn());
vi.mock('@pages/research/remix/DiscoveryRemixProvider', () => ({
  useOptionalDiscoveryRemix: () => ({ openRemix, status: 'idle' }),
}));
const getService = vi.hoisted(() => vi.fn());
const videoPlayer = vi.hoisted(() => vi.fn());
vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: videoPlayer,
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => state,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));
vi.mock('@services/ads/ads-research.service', () => ({
  AdsResearchService: { getInstance: vi.fn() },
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog, useLocale: () => 'en' };
});
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // biome-ignore lint/performance/noImgElement: lightweight next/image test double
    <img src={src} alt={alt} />
  ),
}));
vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));
vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit';
  }) => (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
vi.mock('@ui/primitives/input', () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));
vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <div>
      <input
        aria-label={`select-${value}`}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
}));
describe('explicit public discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    videoPlayer.mockReturnValue(null);
    state.organizationId = 'org';
    state.brandId = 'brand';
    getService.mockResolvedValue({ discover });
  });
  it('does not search on mount and submits without an owned credential', async () => {
    discover.mockResolvedValue({ status: 'empty', advertisers: [] });
    render(<AdsPublicDiscoveryPanel onWatch={vi.fn()} isWatching={false} />);
    expect(discover).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Saved ad search'), {
      target: { value: 'coffee' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search saved ads' }));
    await screen.findByText(
      'No matching saved creatives in the available sample.',
    );
    expect(discover).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: 'coffee',
        platform: 'meta',
        brandId: 'brand',
      }),
      expect.any(AbortSignal),
    );
    expect(discover.mock.calls[0][0].credentialId).toBeUndefined();
  });
  it('submits YouTube and video filters without an owned account', async () => {
    discover.mockResolvedValue({ status: 'empty', advertisers: [] });
    render(<AdsPublicDiscoveryPanel onWatch={vi.fn()} isWatching={false} />);
    fireEvent.change(screen.getByLabelText('select-meta'), {
      target: { value: 'youtube' },
    });
    fireEvent.change(screen.getByLabelText('select-visual'), {
      target: { value: 'video' },
    });
    fireEvent.change(screen.getByLabelText('Saved ad search'), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search saved ads' }));
    await waitFor(() =>
      expect(discover).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'youtube',
          mediaType: 'video',
          keyword: 'example.com',
        }),
        expect.any(AbortSignal),
      ),
    );
  });
  it('renders known media, sample count and stable Watch input', async () => {
    const watchInput = {
      advertiserHandle: '123',
      externalAdvertiserId: '123',
      advertiserName: 'Example',
      platform: 'meta',
    };
    discover.mockResolvedValue({
      status: 'ready',
      sampleCount: 1,
      advertisers: [
        {
          id: 'meta:123',
          name: 'Example',
          creativeCount: 1,
          watchInput,
          samples: [
            {
              id: 'a',
              adPerformanceId: 'canonical-ad',
              freshness: 'saved',
              observedAt: '2026-01-01T00:00:00.000Z',
              imageUrls: ['https://example.com/a.jpg'],
              videoUrls: [
                'https://example.com/creative-video?mime_type=video_mp4',
              ],
              mediaUrls: [],
              archiveUrl: 'https://www.facebook.com/ads/library/?id=a',
            },
          ],
        },
      ],
    });
    const onWatch = vi.fn().mockResolvedValue(true);
    render(<AdsPublicDiscoveryPanel onWatch={onWatch} isWatching={false} />);
    fireEvent.change(screen.getByLabelText('Saved ad search'), {
      target: { value: 'coffee' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search saved ads' }));
    await screen.findByText('Example');
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.com/a.jpg',
    );
    expect(videoPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        src: 'https://example.com/creative-video?mime_type=video_mp4',
        thumbnail: 'https://example.com/a.jpg',
        mediaProps: { poster: 'https://example.com/a.jpg' },
        ariaLabel: 'Public ad video preview',
        config: {
          autoPlay: false,
          controls: true,
          loop: false,
          muted: false,
          playsInline: true,
          preload: 'none',
        },
      }),
      undefined,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remix' }));
    expect(openRemix).toHaveBeenCalledWith({
      kind: 'public_ad',
      adPerformanceId: 'canonical-ad',
    });
    expect(onWatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    await waitFor(() => expect(onWatch).toHaveBeenCalledWith(watchInput));
    await screen.findByRole('button', { name: 'Watching' });
  });
  it('embeds YouTube videos and disables Remix without a canonical source', async () => {
    discover.mockResolvedValue({
      status: 'ready',
      sampleCount: 1,
      advertisers: [
        {
          id: 'youtube:123',
          name: 'YouTube competitor',
          creativeCount: 1,
          samples: [
            {
              id: 'creative',
              imageUrls: [],
              videoUrls: ['https://youtu.be/dQw4w9WgXcQ'],
              mediaUrls: [],
            },
          ],
        },
      ],
    });
    render(<AdsPublicDiscoveryPanel onWatch={vi.fn()} isWatching={false} />);
    fireEvent.change(screen.getByLabelText('Saved ad search'), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search saved ads' }));
    expect(await screen.findByTitle('Public ad video preview')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(screen.getByRole('button', { name: 'Remix' })).toBeDisabled();
    expect(videoPlayer).not.toHaveBeenCalled();
  });
  it('cancels old tenant results without replaying a paid search', async () => {
    let resolve: (value: unknown) => void = () => {};
    discover.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const props = { onWatch: vi.fn(), isWatching: false };
    const view = render(<AdsPublicDiscoveryPanel {...props} />);
    fireEvent.change(screen.getByLabelText('Saved ad search'), {
      target: { value: 'coffee' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search saved ads' }));
    await waitFor(() => expect(discover).toHaveBeenCalledTimes(1));
    state.organizationId = 'other';
    view.rerender(<AdsPublicDiscoveryPanel {...props} />);
    await act(async () => resolve({ status: 'empty', advertisers: [] }));
    expect(discover).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(
        'No matching saved creatives in the available sample.',
      ),
    ).not.toBeInTheDocument();
    expect(discover.mock.calls[0][1].aborted).toBe(true);
  });
  it('never polls a legacy pending response', async () => {
    discover
      .mockResolvedValueOnce({ status: 'pending', advertisers: [] })
      .mockResolvedValueOnce({ status: 'empty', advertisers: [] });
    render(<AdsPublicDiscoveryPanel onWatch={vi.fn()} isWatching={false} />);
    fireEvent.change(screen.getByLabelText('Saved ad search'), {
      target: { value: 'coffee' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search saved ads' }));
    await screen.findByText(
      'Saved data is unavailable for this request. Please try again later.',
    );
    expect(discover).toHaveBeenCalledTimes(1);
  });
  it('distinguishes unconfigured search and displays Watch errors', async () => {
    discover.mockResolvedValue({
      status: 'unavailable',
      reason: 'paid_creative_apify_token_missing',
      advertisers: [],
    });
    render(
      <AdsPublicDiscoveryPanel
        onWatch={vi.fn()}
        isWatching={false}
        watchError="Could not watch advertiser"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not watch advertiser',
    );
    fireEvent.change(screen.getByLabelText('Saved ad search'), {
      target: { value: 'coffee' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search saved ads' }));
    await screen.findByText(
      'Saved ads are temporarily unavailable. Please try again later.',
    );
    expect(
      screen.queryByText(
        'No matching saved creatives in the available sample.',
      ),
    ).not.toBeInTheDocument();
  });
  it.each(['stale', 'unknown', undefined])(
    'disables Remix for %s freshness while preserving source links',
    async (freshness) => {
      discover.mockResolvedValue({
        status: 'ready',
        sampleCount: 1,
        advertisers: [
          {
            id: 'a',
            name: 'Saved',
            creativeCount: 1,
            samples: [
              {
                id: 'ad',
                adPerformanceId: 'canonical',
                freshness,
                imageUrls: [],
                videoUrls: [],
                mediaUrls: [],
                archiveUrl: 'https://example.com/archive',
              },
            ],
          },
        ],
      });
      render(<AdsPublicDiscoveryPanel onWatch={vi.fn()} isWatching={false} />);
      fireEvent.change(screen.getByLabelText('Saved ad search'), {
        target: { value: 'coffee' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Search saved ads' }));
      await screen.findByText('Saved');
      expect(screen.getByRole('button', { name: 'Remix' })).toBeDisabled();
      expect(
        screen.getByRole('link', { name: 'View archive creative' }),
      ).toHaveAttribute('href', 'https://example.com/archive');
      expect(
        screen.getByText(
          freshness === 'stale'
            ? 'Stale source — Remix unavailable'
            : 'Source freshness unknown — Remix unavailable',
        ),
      ).toBeInTheDocument();
    },
  );
});

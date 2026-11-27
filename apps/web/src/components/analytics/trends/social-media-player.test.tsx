import { getSocialMediaSource } from '@genfeedai/helpers/media/social-media-source.helper';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SocialMediaPlayer from './social-media-player';

vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: ({
    src,
    onPlaybackError,
  }: {
    src: string;
    onPlaybackError: () => void;
  }) => (
    <video aria-label="Direct video" src={src} onError={onPlaybackError}>
      <track kind="captions" />
    </video>
  ),
}));

const prepareVideo = vi.hoisted(() => vi.fn());

vi.mock(
  '@/features/trends/hooks/use-trend-video-playback/use-trend-video-playback',
  () => ({ useTrendVideoPlayback: () => prepareVideo }),
);

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: (path: string) => `/acme${path}` }),
}));

describe('interactive social media playback', () => {
  it('mounts the native video embed on explicit play and stops when the tab is hidden', () => {
    const { container } = render(
      <SocialMediaPlayer
        contentType="video"
        sourceUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        title="Example"
      />,
    );
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play Example' }));
    expect(screen.getByTitle('Example')).toHaveAttribute(
      'src',
      expect.stringContaining('controls=1'),
    );
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(container.querySelector('iframe')).toBeNull();
    vi.restoreAllMocks();
  });
  it('retains a source link when a direct video fails to load', () => {
    render(
      <SocialMediaPlayer
        contentType="video"
        mediaUrl="https://cdn.example.com/expired.mp4"
        sourceUrl="https://www.instagram.com/p/abc/"
        title="Clip"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play Clip' }));
    fireEvent.error(screen.getByLabelText('Direct video'));
    expect(
      screen.getByText('Preview unavailable. Open the source to watch.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open source' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/p/abc/',
    );
  });
  it('falls back from an expired CDN video to its native embed', () => {
    render(
      <SocialMediaPlayer
        contentType="video"
        mediaUrl="https://cdn.example.com/expired.mp4"
        sourceUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        title="Fallback"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play Fallback' }));
    fireEvent.error(screen.getByLabelText('Direct video'));
    expect(screen.getByTitle('Fallback')).toHaveAttribute(
      'src',
      expect.stringContaining('youtube-nocookie.com'),
    );
    expect(screen.queryByText(/Preview unavailable/)).not.toBeInTheDocument();
  });

  it('never treats a platform page or unsafe URL as a direct video', () => {
    expect(
      getSocialMediaSource({
        contentType: 'video',
        mediaUrl: 'https://www.instagram.com/p/abc/',
      }).directUrl,
    ).toBeNull();
    expect(
      getSocialMediaSource({
        contentType: 'video',
        sourceUrl: 'javascript:alert(1)',
        mediaUrl: 'data:text/html,test',
      }),
    ).toMatchObject({ sourceUrl: null, directUrl: null, embedUrl: null });
    expect(
      getSocialMediaSource({
        contentType: 'video',
        sourceUrl: 'https://www.tiktok.com/@user/video/123456789',
      }),
    ).toMatchObject({ directUrl: null, embedUrl: null });
  });
});

describe('TikTok and Instagram playback in the app', () => {
  const tiktok = {
    contentType: 'video',
    sourceUrl: 'https://www.tiktok.com/@user/video/123456789',
    thumbnailUrl: 'https://cdn.example.com/cover.jpg',
    title: 'Dance',
    trendVideoId: 'video-1',
  };

  it('plays a saved copy in the Genfeed player and loads no third-party frame', async () => {
    prepareVideo.mockResolvedValue({
      playbackExpiresAt: '2026-12-03T00:00:00.000Z',
      playbackUrl: 'https://cdn.example.com/saved.mp4',
      status: 'ready',
    });
    const { container } = render(<SocialMediaPlayer {...tiktok} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play Dance' }));

    expect(await screen.findByLabelText('Direct video')).toHaveAttribute(
      'src',
      'https://cdn.example.com/saved.mp4',
    );
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('skips the request when the trend data already carries a saved copy', () => {
    prepareVideo.mockClear();
    render(
      <SocialMediaPlayer
        {...tiktok}
        playbackUrl="https://cdn.example.com/already.mp4"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play Dance' }));

    expect(screen.getByLabelText('Direct video')).toHaveAttribute(
      'src',
      'https://cdn.example.com/already.mp4',
    );
    expect(prepareVideo).not.toHaveBeenCalled();
  });

  it('sends the free plan to its plans instead of playing', async () => {
    prepareVideo.mockResolvedValue({ status: 'upgrade' });
    render(<SocialMediaPlayer {...tiktok} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play Dance' }));

    expect(
      await screen.findByText(
        'Playing TikTok and Instagram videos in Genfeed is on paid plans.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/acme\//),
    );
  });

  it('says so when the video cannot be saved, and offers the platform link', async () => {
    prepareVideo.mockResolvedValue({ status: 'unavailable' });
    render(<SocialMediaPlayer {...tiktok} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play Dance' }));

    expect(
      await screen.findByText(
        "This video can't be played here. Open it on the platform.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Play Dance' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open source' })).toHaveAttribute(
      'href',
      tiktok.sourceUrl,
    );
  });

  it('shows no play button for a TikTok card without a trend video to save', () => {
    const { container } = render(
      <SocialMediaPlayer {...tiktok} trendVideoId={undefined} />,
    );

    expect(
      screen.queryByRole('button', { name: 'Play Dance' }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Open source' }),
    ).toBeInTheDocument();
  });
});

vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  const { default: ui } = await import('../../../../messages/en/ui.json');
  return { useTranslations: createTranslateFromCatalog({ ui }) };
});

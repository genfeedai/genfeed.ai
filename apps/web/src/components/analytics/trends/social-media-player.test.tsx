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
        sourceUrl="https://www.facebook.com/watch/?v=1"
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
      'https://www.facebook.com/watch/?v=1',
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
  });
});

describe('TikTok and Instagram playback on the platform', () => {
  it.each([
    [
      'https://www.tiktok.com/@user/video/7300000000000000000',
      'https://www.tiktok.com/player/v1/7300000000000000000?rel=0',
    ],
    [
      'https://www.instagram.com/reel/Cabc123/',
      'https://www.instagram.com/reel/Cabc123/embed',
    ],
    [
      'https://www.instagram.com/creator/reel/Cabc123/?igsh=x',
      'https://www.instagram.com/reel/Cabc123/embed',
    ],
    [
      'https://www.instagram.com/p/Cabc123/',
      'https://www.instagram.com/p/Cabc123/embed',
    ],
  ])('embeds the platform player for %s', (sourceUrl, embedUrl) => {
    expect(
      getSocialMediaSource({ contentType: 'video', sourceUrl }),
    ).toMatchObject({ directUrl: null, embedUrl });
  });

  it.each([
    'https://www.tiktok.com/@user',
    'https://vm.tiktok.com/ZMabc/',
    'https://www.instagram.com/creator/',
    'https://evil.example/tiktok.com/@user/video/7300000000000000000',
  ])('builds no embed for %s', (sourceUrl) => {
    expect(
      getSocialMediaSource({ contentType: 'video', sourceUrl }).embedUrl,
    ).toBeNull();
  });

  it('builds no platform embed for a hover preview', () => {
    expect(
      getSocialMediaSource(
        {
          contentType: 'video',
          sourceUrl: 'https://www.tiktok.com/@user/video/7300000000000000000',
        },
        false,
      ).embedUrl,
    ).toBeNull();
  });

  it('plays a TikTok video in its own player and copies nothing', () => {
    render(
      <SocialMediaPlayer
        contentType="video"
        sourceUrl="https://www.tiktok.com/@user/video/7300000000000000000"
        thumbnailUrl="https://cdn.example.com/cover.jpg"
        title="Dance"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play Dance' }));

    expect(screen.getByTitle('Dance')).toHaveAttribute(
      'src',
      'https://www.tiktok.com/player/v1/7300000000000000000?rel=0',
    );
    expect(screen.queryByLabelText('Direct video')).not.toBeInTheDocument();
  });

  it('shows no play button for a TikTok page it cannot embed, and keeps the link', () => {
    const { container } = render(
      <SocialMediaPlayer
        contentType="video"
        sourceUrl="https://vm.tiktok.com/ZMabc/"
        title="Dance"
      />,
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

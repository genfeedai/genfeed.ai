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
      }).embedUrl,
    ).toContain('controls=1');
  });
});

vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  const { default: ui } = await import(
    '../../../../../../apps/app/messages/en/ui.json'
  );
  return { useTranslations: createTranslateFromCatalog({ ui }) };
});

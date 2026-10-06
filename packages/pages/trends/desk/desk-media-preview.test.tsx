import DeskMediaPreview from '@pages/trends/desk/desk-media-preview';
import type { DiscoveryDeskItem } from '@props/trends/discovery-desk.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: ({ mediaProps }: { mediaProps: { onError: () => void } }) => (
    <video aria-label="Native preview" onError={mediaProps.onError}>
      <track kind="captions" />
    </video>
  ),
}));

const item = {
  contentType: 'video',
  platform: 'tiktok',
  title: 'Preview',
  mediaUrl: 'https://cdn.example.com/expired.mp4',
  sourceUrl: 'https://www.tiktok.com/@creator/video/6718335390845095173',
} as DiscoveryDeskItem;

describe('Discovery preview fallback', () => {
  it('falls back from a failed direct media URL to its muted platform embed', async () => {
    const { rerender } = render(<DeskMediaPreview item={item} isActive />);
    fireEvent.error(await screen.findByLabelText('Native preview'));
    const embed = await screen.findByTitle('Preview');
    expect(embed).toHaveAttribute('src', expect.stringContaining('muted=1'));
    expect(screen.queryByLabelText('Native preview')).not.toBeInTheDocument();
    rerender(<DeskMediaPreview item={item} isActive={false} />);
    expect(screen.queryByTitle('Preview')).not.toBeInTheDocument();
  });
  it('keeps the working embed on subsequent hovers instead of retrying expired media', async () => {
    const { rerender } = render(<DeskMediaPreview item={item} isActive />);
    fireEvent.error(await screen.findByLabelText('Native preview'));
    expect(await screen.findByTitle('Preview')).toBeInTheDocument();
    rerender(<DeskMediaPreview item={item} isActive={false} />);
    expect(screen.queryByTitle('Preview')).not.toBeInTheDocument();
    rerender(<DeskMediaPreview item={item} isActive />);
    expect(await screen.findByTitle('Preview')).toBeInTheDocument();
    expect(screen.queryByLabelText('Native preview')).not.toBeInTheDocument();
  });
});

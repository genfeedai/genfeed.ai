import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MediaPreview } from './MediaPreview';

vi.mock('@ui/media-player/MediaPlayer', () => ({
  default: ({
    src,
    label,
    variant,
    stopOnUnmount,
  }: {
    src: string;
    label: string;
    variant: string;
    stopOnUnmount: boolean;
  }) => (
    <button
      type="button"
      data-url={src}
      data-variant={variant}
      data-stop-on-unmount={String(stopOnUnmount)}
    >
      {label}
    </button>
  ),
}));
vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: () => <div>Video preview</div>,
}));
vi.mock('next/image', () => ({ default: () => <div>Image preview</div> }));

describe('MediaPreview audio review', () => {
  it('renders the shared player with a seekable timeline and unmount cleanup', () => {
    render(
      <MediaPreview
        src="https://cdn.example.com/background.wav"
        type="audio"
        controls
        autoPlay={false}
      />,
    );
    const player = screen.getByRole('button', { name: 'Review audio' });
    expect(player).toHaveAttribute(
      'data-url',
      'https://cdn.example.com/background.wav',
    );
    expect(player).toHaveAttribute('data-variant', 'row');
    expect(player).toHaveAttribute('data-stop-on-unmount', 'true');
    expect(screen.queryByText('Video preview')).not.toBeInTheDocument();
    expect(screen.queryByText('Image preview')).not.toBeInTheDocument();
  });
});

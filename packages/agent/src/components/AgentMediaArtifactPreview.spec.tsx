import '@agent-tests/media-preview-mocks';
import { AgentMediaArtifactPreview } from '@genfeedai/agent/components/AgentMediaArtifactPreview';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';

describe('AgentMediaArtifactPreview', () => {
  it('uses masonry images and opens the selected item in the shared collection viewer', () => {
    render(
      <AgentMediaArtifactPreview
        assets={[
          {
            kind: 'image',
            title: 'Image 1',
            url: 'https://cdn.test/image-1.png',
          },
          {
            kind: 'image',
            title: 'Image 2',
            url: 'https://cdn.test/image-2.png',
          },
        ]}
      />,
    );
    const images = screen.getAllByTestId('masonry-image');
    expect(images[0]).toHaveAttribute(
      'data-url',
      'https://cdn.test/image-1.png',
    );
    expect(images[0]).toHaveAttribute('data-actions', 'false');
    expect(images[0]).toHaveAttribute('data-drag', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Image 2' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('data-index', '1');
    expect(screen.getByRole('dialog')).toHaveAttribute('data-count', '2');
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-url',
      'https://cdn.test/image-2.png',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uses masonry video and preserves the source URL', () => {
    render(
      <AgentMediaArtifactPreview
        assets={[
          {
            kind: 'video',
            title: 'Launch video',
            url: 'https://cdn.test/video.mp4',
          },
        ]}
      />,
    );
    expect(screen.getByTestId('masonry-video')).toHaveAttribute(
      'data-url',
      'https://cdn.test/video.mp4',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Launch video' }));
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-url',
      'https://cdn.test/video.mp4',
    );
  });

  it('keeps mixed audio and visual outputs aligned when opening the lightbox', () => {
    render(
      <AgentMediaArtifactPreview
        assets={[
          { kind: 'image', url: '   ' },
          {
            kind: 'audio',
            title: 'Voiceover',
            url: 'https://cdn.test/voice.mp3',
          },
          { kind: 'video', title: 'Video', url: 'https://cdn.test/video.mp4' },
          { kind: 'image', title: 'Image', url: 'https://cdn.test/image.png' },
        ]}
      />,
    );
    expect(screen.getByTestId('shared-audio-player')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Image' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('data-index', '1');
    expect(screen.getByRole('dialog')).toHaveAttribute('data-count', '2');
  });

  it('updates video sizing from intrinsic dimensions and resets it for a new URL', () => {
    const { rerender } = render(
      <AgentMediaArtifactPreview
        assets={[{ kind: 'video', url: 'https://cdn.test/portrait.mp4' }]}
      />,
    );
    expect(screen.getByTestId('masonry-video')).toHaveAttribute(
      'data-width',
      '16',
    );
    const video = screen.getByTestId('video-metadata');
    Object.defineProperties(video, {
      videoWidth: { value: 1080 },
      videoHeight: { value: 1920 },
    });
    fireEvent.loadedMetadata(video);
    expect(screen.getByTestId('masonry-video')).toHaveAttribute(
      'data-width',
      '1080',
    );
    expect(screen.getByTestId('masonry-video')).toHaveAttribute(
      'data-height',
      '1920',
    );
    rerender(
      <AgentMediaArtifactPreview
        assets={[
          {
            kind: 'video',
            url: 'https://cdn.test/landscape.mp4',
            width: 1920,
            height: 1080,
          },
        ]}
      />,
    );
    expect(screen.getByTestId('masonry-video')).toHaveAttribute(
      'data-width',
      '1920',
    );
    expect(screen.getByTestId('masonry-video')).toHaveAttribute(
      'data-height',
      '1080',
    );
  });

  it('renders nothing for empty output URLs', () => {
    const { container } = render(
      <AgentMediaArtifactPreview assets={[{ kind: 'image', url: ' ' }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

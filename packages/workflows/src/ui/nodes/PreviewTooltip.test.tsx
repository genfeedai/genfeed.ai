import type {
  ImageGenNodeData,
  VideoGenNodeData,
} from '@genfeedai/contracts/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreviewTooltip } from './PreviewTooltip';

const { videoPlayerMock } = vi.hoisted(() => ({ videoPlayerMock: vi.fn() }));

vi.mock('@genfeedai/ui/components/display/video-player/VideoPlayer', () => ({
  default: (props: { src: string; ariaLabel: string }) => {
    videoPlayerMock(props);
    return (
      <div
        aria-label={props.ariaLabel}
        data-src={props.src}
        data-testid="shared-video-player"
        role="group"
      />
    );
  },
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span aria-label={alt} data-src={src} data-testid="next-image" role="img" />
  ),
}));

function makeAnchor(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    bottom: 420,
    height: 20,
    left: 500,
    right: 600,
    toJSON: () => ({}),
    top: 400,
    width: 100,
    x: 500,
    y: 400,
    ...overrides,
  } as DOMRect;
}

const imageData = {
  label: 'Image Generator',
  outputImage: 'https://cdn/preview.png',
  status: 'complete',
} as unknown as ImageGenNodeData;

describe('PreviewTooltip', () => {
  it('renders an image preview with the node label', () => {
    render(
      <PreviewTooltip
        anchorRect={makeAnchor()}
        isVisible={true}
        nodeData={imageData}
        nodeType="imageGen"
      />,
    );

    const image = screen.getByTestId('next-image');
    expect(image).toHaveAttribute('data-src', 'https://cdn/preview.png');
    expect(screen.getByText('Image Generator')).toBeInTheDocument();
  });

  it('renders nothing when not visible', () => {
    const { container } = render(
      <PreviewTooltip
        anchorRect={makeAnchor()}
        isVisible={false}
        nodeData={imageData}
        nodeType="imageGen"
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();
  });

  it('renders nothing without media or an anchor', () => {
    render(
      <PreviewTooltip
        anchorRect={makeAnchor()}
        isVisible={true}
        nodeData={
          { label: 'Empty', status: 'idle' } as unknown as ImageGenNodeData
        }
        nodeType="imageGen"
      />,
    );
    expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();

    render(
      <PreviewTooltip
        anchorRect={null}
        isVisible={true}
        nodeData={imageData}
        nodeType="imageGen"
      />,
    );
    expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();
  });

  it('uses the shared player with silent looping playback for video previews', () => {
    render(
      <PreviewTooltip
        anchorRect={makeAnchor()}
        isVisible={true}
        nodeData={
          {
            label: 'Video Generator',
            outputVideo: 'https://cdn/clip.mp4',
            status: 'complete',
          } as unknown as VideoGenNodeData
        }
        nodeType="videoGen"
      />,
    );

    const video = screen.getByLabelText('Video preview');
    expect(video).toHaveAttribute('data-src', 'https://cdn/clip.mp4');
    expect(videoPlayerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          autoPlay: true,
          controls: false,
          loop: true,
          muted: true,
          playsInline: true,
        }),
      }),
    );
  });

  it('flips below the anchor when there is no room above', () => {
    render(
      <PreviewTooltip
        anchorRect={makeAnchor({ bottom: 60, top: 40 })}
        isVisible={true}
        nodeData={imageData}
        nodeType="imageGen"
      />,
    );

    // bottom placement: tooltip top = anchor.bottom + 12
    const tooltip = document.querySelector('.fixed') as HTMLElement;
    expect(tooltip.style.top).toBe('72px');
  });
});

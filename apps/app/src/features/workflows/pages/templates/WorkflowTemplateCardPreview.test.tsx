import '@testing-library/jest-dom/vitest';
import { MediaType } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkflowTemplateCardPreview from './WorkflowTemplateCardPreview';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    unoptimized: _unoptimized,
    alt,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
    unoptimized?: boolean;
  }) => <img alt={alt} {...props} />,
}));

const nodes = [
  { id: 'write', type: 'genfeedAction', data: { label: 'Write thread' } },
  { id: 'publish', type: 'genfeedAction', data: { label: 'Publish' } },
];
const edges = [{ source: 'write', target: 'publish' }];

const IMAGE_OUTPUT = {
  mediaType: MediaType.IMAGE,
  url: 'https://cdn.example.com/examples/thread.png',
};

const VIDEO_OUTPUT = {
  mediaType: MediaType.VIDEO,
  posterUrl: 'https://cdn.example.com/examples/ugc.jpg',
  url: 'https://cdn.example.com/examples/ugc.mp4',
};

function stubReducedMotion(isReduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      addEventListener: vi.fn(),
      matches: isReduced,
      removeEventListener: vi.fn(),
    })),
  );
}

/** Reports every observed element as on screen. */
function stubVisibleViewport() {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(
        private readonly callback: (
          entries: Array<Pick<IntersectionObserverEntry, 'isIntersecting'>>,
        ) => void,
      ) {}
      disconnect() {}
      observe() {
        this.callback([{ isIntersecting: true }]);
      }
      unobserve() {}
    },
  );
}

function renderPreview(
  exampleOutput?: typeof IMAGE_OUTPUT | typeof VIDEO_OUTPUT,
) {
  return render(
    <WorkflowTemplateCardPreview
      name="Founder X thread"
      exampleOutput={exampleOutput}
      nodes={nodes}
      edges={edges}
    />,
  );
}

function exampleVideo(): HTMLVideoElement {
  const video = screen.getByLabelText(
    'Example output video from Founder X thread',
  );
  if (!(video instanceof HTMLVideoElement)) {
    throw new Error('Example output video not rendered');
  }
  return video;
}

describe('WorkflowTemplateCardPreview', () => {
  let play: ReturnType<typeof vi.spyOn>;
  let pause: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    pause = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);
    stubReducedMotion(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the workflow graph when the template has no example output', () => {
    renderPreview();

    expect(
      screen.getByRole('img', { name: 'Founder X thread workflow diagram' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('workflow-template-example-output'),
    ).not.toBeInTheDocument();
  });

  it('shows an example image instead of the graph, lazily loaded', () => {
    renderPreview(IMAGE_OUTPUT);

    const image = screen.getByRole('img', {
      name: 'Example output from Founder X thread',
    });
    expect(image).toHaveAttribute('src', IMAGE_OUTPUT.url);
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(
      screen.queryByRole('img', { name: 'Founder X thread workflow diagram' }),
    ).not.toBeInTheDocument();
  });

  it('falls back to the graph when the example image fails', () => {
    renderPreview(IMAGE_OUTPUT);

    fireEvent.error(
      screen.getByRole('img', { name: 'Example output from Founder X thread' }),
    );

    expect(
      screen.getByRole('img', { name: 'Founder X thread workflow diagram' }),
    ).toBeInTheDocument();
  });

  it('renders a muted, looping, inline video without controls behind its poster', () => {
    renderPreview(VIDEO_OUTPUT);

    const video = exampleVideo();
    expect(video).toHaveAttribute('src', VIDEO_OUTPUT.url);
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video).toHaveAttribute('playsinline');
    expect(video).not.toHaveAttribute('autoplay');
    expect(video).not.toHaveAttribute('controls');
    expect(video).toHaveAttribute('preload', 'none');
    expect(
      screen.getByRole('img', { name: 'Video thumbnail' }),
    ).toHaveAttribute('src', VIDEO_OUTPUT.posterUrl);
  });

  it('preloads metadata when a video has no poster to show', () => {
    renderPreview({ mediaType: MediaType.VIDEO, url: VIDEO_OUTPUT.url });

    expect(exampleVideo()).toHaveAttribute('preload', 'metadata');
  });

  it('plays the video only once it is on screen', () => {
    renderPreview(VIDEO_OUTPUT);
    expect(play).not.toHaveBeenCalled();

    stubVisibleViewport();
    renderPreview(VIDEO_OUTPUT);

    expect(play).toHaveBeenCalledTimes(1);
  });

  it('keeps the video still for reduced motion', () => {
    stubReducedMotion(true);
    stubVisibleViewport();

    renderPreview(VIDEO_OUTPUT);

    expect(play).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
  });

  it('falls back to the graph when the example video fails', () => {
    renderPreview(VIDEO_OUTPUT);

    fireEvent.error(exampleVideo());

    expect(
      screen.getByRole('img', { name: 'Founder X thread workflow diagram' }),
    ).toBeInTheDocument();
  });
});

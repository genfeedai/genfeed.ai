import type { StoryboardFrame } from '@genfeedai/client/schemas';
import SceneFrameRow from '@pages/studio/storyboard/components/SceneFrameRow';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('next/image', () => ({
  default: ({ src, alt }: Record<string, unknown>) => (
    <img src={src as string} alt={alt as string} />
  ),
}));

function makeFrame(overrides: Partial<StoryboardFrame> = {}): StoryboardFrame {
  return {
    duration: 5,
    id: 'frame-1',
    imageId: 'image-1',
    imageUrl: 'https://cdn.test/image-1.png',
    order: 0,
    prompt: 'A slow push-in on the product',
    status: 'pending',
    ...overrides,
  };
}

function renderRow(frame: StoryboardFrame, isBusy = false) {
  const onChange = vi.fn();
  const onRemove = vi.fn();
  const onRetry = vi.fn();

  render(
    <SceneFrameRow
      frame={frame}
      isBusy={isBusy}
      onChange={onChange}
      onRemove={onRemove}
      onRetry={onRetry}
    />,
  );

  return { onChange, onRemove, onRetry };
}

describe('SceneFrameRow', () => {
  it('labels a pending frame as ready without offering a retry', () => {
    renderRow(makeFrame());

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /retry/i }),
    ).not.toBeInTheDocument();
  });

  it('surfaces the failure reason and a retry action on a failed frame', () => {
    const { onRetry } = renderRow(
      makeFrame({ error: 'Provider rejected the prompt', status: 'failed' }),
    );

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(
      screen.getByText('Provider rejected the prompt'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledWith('frame-1');
  });

  it('locks editing and removal while the batch is running', () => {
    renderRow(makeFrame({ status: 'generating' }), true);

    expect(screen.getByText('Generating')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /remove scene 1/i }),
    ).toBeDisabled();
  });

  it('reports a completed frame', () => {
    renderRow(
      makeFrame({
        status: 'completed',
        videoId: 'video-1',
        videoThumbnailUrl: 'https://cdn.test/video-1-thumb.png',
      }),
    );

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByAltText('Scene 1')).toHaveAttribute(
      'src',
      'https://cdn.test/video-1-thumb.png',
    );
  });
});

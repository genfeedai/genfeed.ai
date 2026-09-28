import { EditorEffectType, EditorTrackType } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorEffectsPanel from './EditorEffectsPanel';
import '@testing-library/jest-dom/vitest';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('EditorEffectsPanel', () => {
  beforeAll(() => {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <EditorEffectsPanel
        tracks={[]}
        selectedTrackId={null}
        selectedClipId={null}
        onTrackUpdate={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it('disables adding, tuning and removing effects in a read-only project', () => {
    render(
      <EditorEffectsPanel
        tracks={[
          {
            clips: [
              {
                durationFrames: 60,
                effects: [{ intensity: 40, type: EditorEffectType.BLUR }],
                id: 'clip-1',
                ingredientId: 'video-1',
                ingredientUrl: 'https://cdn.example.test/videos/video-1',
                sourceEndFrame: 60,
                sourceStartFrame: 0,
                startFrame: 0,
              },
            ],
            id: 'video-track',
            isLocked: false,
            isMuted: false,
            name: 'Video 1',
            type: EditorTrackType.VIDEO,
            volume: 100,
          },
        ]}
        isReadOnly={true}
        selectedTrackId="video-track"
        selectedClipId="clip-1"
        onTrackUpdate={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Brightness/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '✕' })).toBeDisabled();
    expect(screen.getByRole('slider')).toHaveAttribute('data-disabled');
  });
});

import { EditorTrackType } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorPropertiesPanel from './EditorPropertiesPanel';
import '@testing-library/jest-dom/vitest';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('EditorPropertiesPanel', () => {
  beforeAll(() => {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<EditorPropertiesPanel />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('disables every property control in a read-only project', () => {
    render(
      <EditorPropertiesPanel
        tracks={[
          {
            clips: [
              {
                durationFrames: 60,
                effects: [],
                id: 'clip-1',
                ingredientId: 'video-1',
                ingredientUrl: 'https://cdn.example.test/videos/video-1',
                sourceEndFrame: 60,
                sourceStartFrame: 0,
                startFrame: 0,
                volume: 80,
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
        fps={30}
        isReadOnly={true}
        selectedTrackId="video-track"
        selectedClipId="clip-1"
        onTrackUpdate={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('Video 1')).toBeDisabled();
    for (const input of screen.getAllByRole('spinbutton')) {
      expect(input).toBeDisabled();
    }
    for (const slider of screen.getAllByRole('slider')) {
      expect(slider).toHaveAttribute('data-disabled');
    }
    expect(screen.getByRole('button', { name: 'Mute' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lock' })).toBeDisabled();
  });
});

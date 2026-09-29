import { EditorTrackType } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorTextPanel from './EditorTextPanel';
import '@testing-library/jest-dom/vitest';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('EditorTextPanel', () => {
  beforeAll(() => {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <EditorTextPanel
        tracks={[]}
        fps={30}
        totalFrames={300}
        selectedTrackId={null}
        selectedClipId={null}
        onAddTextTrack={vi.fn()}
        onTrackUpdate={vi.fn()}
        onClipSelect={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it('disables adding, deleting and editing text in a read-only project', () => {
    render(
      <EditorTextPanel
        tracks={[
          {
            clips: [
              {
                durationFrames: 90,
                effects: [],
                id: 'text-clip',
                ingredientId: '',
                ingredientUrl: '',
                sourceEndFrame: 90,
                sourceStartFrame: 0,
                startFrame: 0,
                textOverlay: {
                  color: '#ffffff',
                  fontFamily: 'Arial',
                  fontSize: 48,
                  fontWeight: 700,
                  position: { x: 50, y: 50 },
                  text: 'Headline',
                },
              },
            ],
            id: 'text-track',
            isLocked: false,
            isMuted: false,
            name: 'Text 1',
            type: EditorTrackType.TEXT,
            volume: 100,
          },
        ]}
        fps={30}
        totalFrames={300}
        isReadOnly={true}
        selectedTrackId="text-track"
        selectedClipId="text-clip"
        onAddTextTrack={vi.fn()}
        onTrackUpdate={vi.fn()}
        onClipSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '+ Add Text' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Set color #ff0000' }),
    ).toBeDisabled();
  });
});

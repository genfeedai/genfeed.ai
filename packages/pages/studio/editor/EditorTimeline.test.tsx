import EditorTimeline from '@pages/studio/editor/EditorTimeline';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

describe('EditorTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <EditorTimeline
        tracks={[]}
        currentFrame={0}
        totalFrames={300}
        fps={30}
        zoom={1}
        onSeek={vi.fn()}
        onTrackUpdate={vi.fn()}
        onClipMove={vi.fn()}
        onClipResize={vi.fn()}
        onClipSelect={vi.fn()}
        selectedClipId={null}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });
});

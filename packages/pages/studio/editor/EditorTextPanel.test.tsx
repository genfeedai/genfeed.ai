import EditorTextPanel from '@pages/studio/editor/EditorTextPanel';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

describe('EditorTextPanel', () => {
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
});

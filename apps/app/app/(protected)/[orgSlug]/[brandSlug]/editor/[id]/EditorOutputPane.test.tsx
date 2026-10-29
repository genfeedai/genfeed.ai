import '@testing-library/jest-dom/vitest';
import type { IEditorProject } from '@genfeedai/contracts/interfaces';
import type { EditorTimelineProps } from '@props/studio/editor-timeline.props';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import EditorOutputPane from './EditorOutputPane';

vi.mock('./EditorPreview', () => ({
  default: () => <div data-testid="editor-preview" />,
}));

vi.mock('./EditorTimeline', () => ({
  default: ({ onClipSelect, selectedClipId }: EditorTimelineProps) => (
    <button
      data-selected={selectedClipId ?? ''}
      data-testid="editor-timeline"
      onClick={() => onClipSelect('track-1', 'clip-1')}
      type="button"
    >
      timeline
    </button>
  ),
}));

const project = {
  settings: {
    backgroundColor: '#000000',
    fps: 30,
    height: 1080,
    width: 1920,
  },
  totalDurationFrames: 300,
  tracks: [],
} as unknown as IEditorProject;

describe('EditorOutputPane', () => {
  it('renders the preview over the timeline and reports clip selection', async () => {
    const onClipSelect = vi.fn();

    render(
      <EditorOutputPane
        currentFrame={0}
        isReadOnly={false}
        onClipMove={vi.fn()}
        onClipResize={vi.fn()}
        onClipSelect={onClipSelect}
        onFrameChange={vi.fn()}
        onPlayingChange={vi.fn()}
        onSeek={vi.fn()}
        onTrackUpdate={vi.fn()}
        previewRef={createRef()}
        project={project}
        selectedClipId="clip-9"
        zoom={1}
      />,
    );

    expect(screen.getByTestId('editor-preview')).toBeInTheDocument();
    const timeline = screen.getByTestId('editor-timeline');
    expect(timeline).toHaveAttribute('data-selected', 'clip-9');

    await userEvent.click(timeline);

    expect(onClipSelect).toHaveBeenCalledWith('track-1', 'clip-1');
  });
});

import type { ClipResult } from '@props/studio/clips.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClipResultCard from './ClipResultCard';
import '@testing-library/jest-dom/vitest';

const pushSpy = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushSpy,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/brand${path}`,
  }),
}));

vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: ({ ariaLabel, src }: { ariaLabel: string; src: string }) => (
    <div aria-label={ariaLabel} data-testid="video-player" role="img">
      {src}
    </div>
  ),
}));

function makeClip(overrides?: Partial<ClipResult>): ClipResult {
  return {
    _id: 'clip-1',
    captionedVideoUrl: undefined,
    clipType: 'hook',
    duration: 30,
    endTime: 45,
    startTime: 15,
    status: 'pending',
    summary: 'A compelling viral moment',
    tags: ['ai', 'tech', 'startup'],
    title: 'Test Clip Title',
    videoUrl: undefined,
    viralityScore: 85,
    ...overrides,
  };
}

describe('ClipResultCard', () => {
  const clipsService = {
    createEditorHandoff: vi.fn().mockResolvedValue({
      editorPath: '/editor/editor-1',
      editorProjectId: 'editor-1',
      videoUrl: 'https://cdn.example.com/video.mp4',
    }),
    createPublishHandoff: vi.fn().mockResolvedValue({
      payload: {
        assets: [
          {
            assetId: 'clip-1',
            mediaUrl: 'https://cdn.example.com/video.mp4',
            mimeType: 'video/mp4',
          },
        ],
        metadata: {
          clipResultId: 'clip-1',
          summary: 'Clip summary for publish handoff',
          title: 'My Great Clip',
        },
      },
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render clip title and summary', () => {
    render(
      <ClipResultCard
        clip={makeClip()}
        clipsService={clipsService as never}
        projectId="project-1"
      />,
    );

    expect(screen.getByText('Test Clip Title')).toBeInTheDocument();
    expect(screen.getByText('A compelling viral moment')).toBeInTheDocument();
  });

  it('should display the correct status badge', () => {
    render(
      <ClipResultCard
        clip={makeClip({ status: 'extracting' })}
        clipsService={clipsService as never}
        projectId="project-1"
      />,
    );

    expect(screen.getByText('Generating')).toBeInTheDocument();
  });

  it('previews a completed raw cut', () => {
    render(
      <ClipResultCard
        clip={makeClip({
          mode: 'raw-cut',
          status: 'completed',
          videoUrl: 'https://cdn.example.com/raw-cut.mp4',
        })}
        clipsService={clipsService as never}
        projectId="project-1"
      />,
    );

    expect(screen.getByText('Raw cut')).toBeInTheDocument();
    expect(screen.getByTestId('video-player')).toHaveTextContent(
      'https://cdn.example.com/raw-cut.mp4',
    );
    expect(
      screen.getByLabelText('Preview Test Clip Title'),
    ).toBeInTheDocument();
  });

  it('should show action buttons only when status is completed', () => {
    const { rerender } = render(
      <ClipResultCard
        clip={makeClip({ status: 'pending' })}
        clipsService={clipsService as never}
        projectId="project-1"
      />,
    );

    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Publish')).not.toBeInTheDocument();

    rerender(
      <ClipResultCard
        clip={makeClip({
          readiness: {
            blockingReasons: [],
            readyActions: ['download', 'edit', 'publish'],
            state: 'ready',
            terminal: true,
            terminalAt: '2026-06-30T00:00:00Z',
          },
          status: 'completed',
          videoUrl: 'https://cdn.example.com/video.mp4',
        })}
        clipsService={clipsService as never}
        projectId="project-1"
      />,
    );

    expect(screen.getByText('Edit').closest('button')).toHaveClass(
      'min-h-11',
      'sm:min-h-8',
    );
    expect(screen.getByText('Publish').closest('button')).toHaveClass(
      'min-h-11',
      'sm:min-h-8',
    );
  });

  it('should create publish handoff before navigating to compose', async () => {
    render(
      <ClipResultCard
        clip={makeClip({
          readiness: {
            blockingReasons: [],
            readyActions: ['download', 'edit', 'publish'],
            state: 'ready',
            terminal: true,
            terminalAt: '2026-06-30T00:00:00Z',
          },
          status: 'completed',
          summary: 'Clip summary for publish handoff',
          title: 'My Great Clip',
          videoUrl: 'https://cdn.example.com/video.mp4',
        })}
        clipsService={clipsService as never}
        projectId="project-1"
      />,
    );

    fireEvent.click(screen.getByText('Publish'));

    await waitFor(() =>
      expect(clipsService.createPublishHandoff).toHaveBeenCalledWith(
        'project-1',
        'clip-1',
      ),
    );
    expect(pushSpy).toHaveBeenCalledWith(
      expect.stringContaining('/acme/brand/compose/post?'),
    );
  });

  it('should create editor handoff before navigating to the editor project', async () => {
    render(
      <ClipResultCard
        clip={makeClip({
          readiness: {
            blockingReasons: [],
            readyActions: ['download', 'edit', 'publish'],
            state: 'ready',
            terminal: true,
            terminalAt: '2026-06-30T00:00:00Z',
          },
          status: 'completed',
          videoUrl: 'https://cdn.example.com/video.mp4',
        })}
        clipsService={clipsService as never}
        projectId="project-1"
      />,
    );

    fireEvent.click(screen.getByText('Edit'));

    await waitFor(() =>
      expect(clipsService.createEditorHandoff).toHaveBeenCalledWith(
        'project-1',
        'clip-1',
      ),
    );
    expect(pushSpy).toHaveBeenCalledWith('/acme/brand/editor/editor-1');
  });

  it('should respect ready actions when readiness metadata is present', () => {
    render(
      <ClipResultCard
        clip={makeClip({
          readiness: {
            blockingReasons: [],
            readyActions: ['download'],
            state: 'ready',
            terminal: true,
            terminalAt: '2026-06-30T00:00:00Z',
          },
          status: 'completed',
          videoUrl: 'https://cdn.example.com/video.mp4',
        })}
        clipsService={clipsService as never}
        projectId="project-1"
      />,
    );

    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Publish')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Download video')).toHaveClass(
      'min-h-11',
      'min-w-11',
      'sm:min-h-8',
      'sm:min-w-8',
    );
  });

  it('should display virality score', () => {
    render(
      <ClipResultCard
        clip={makeClip({ viralityScore: 92 })}
        clipsService={clipsService as never}
        projectId="project-1"
      />,
    );

    expect(screen.getByText('92')).toBeInTheDocument();
  });

  it('should display tags with a maximum of 3 visible', () => {
    render(
      <ClipResultCard
        clip={makeClip({ tags: ['ai', 'tech', 'startup', 'viral', 'growth'] })}
        clipsService={clipsService as never}
        projectId="project-1"
      />,
    );

    expect(screen.getByText('#ai')).toBeInTheDocument();
    expect(screen.getByText('#tech')).toBeInTheDocument();
    expect(screen.getByText('#startup')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.queryByText('#viral')).not.toBeInTheDocument();
  });

  it('should show failed state message when clip failed', () => {
    render(
      <ClipResultCard
        clip={makeClip({ status: 'failed' })}
        clipsService={clipsService as never}
        projectId="project-1"
      />,
    );

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText(/Generation failed/)).toBeInTheDocument();
  });
});

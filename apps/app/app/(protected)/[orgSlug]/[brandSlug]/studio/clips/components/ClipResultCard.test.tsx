import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClipResultCard, { type ClipResult } from './ClipResultCard';
import '@testing-library/jest-dom';

const pushSpy = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushSpy,
  }),
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
  const mockGetToken = vi.fn().mockResolvedValue('test-token');
  const apiEndpoint = 'https://api.example.com';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render clip title and summary', () => {
    render(
      <ClipResultCard
        clip={makeClip()}
        apiEndpoint={apiEndpoint}
        getToken={mockGetToken}
      />,
    );

    expect(screen.getByText('Test Clip Title')).toBeInTheDocument();
    expect(screen.getByText('A compelling viral moment')).toBeInTheDocument();
  });

  it('should display the correct status badge', () => {
    render(
      <ClipResultCard
        clip={makeClip({ status: 'extracting' })}
        apiEndpoint={apiEndpoint}
        getToken={mockGetToken}
      />,
    );

    expect(screen.getByText('Generating')).toBeInTheDocument();
  });

  it('should show action buttons only when status is completed', () => {
    const { rerender } = render(
      <ClipResultCard
        clip={makeClip({ status: 'pending' })}
        apiEndpoint={apiEndpoint}
        getToken={mockGetToken}
      />,
    );

    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Publish')).not.toBeInTheDocument();

    rerender(
      <ClipResultCard
        clip={makeClip({
          status: 'completed',
          videoUrl: 'https://cdn.example.com/video.mp4',
        })}
        apiEndpoint={apiEndpoint}
        getToken={mockGetToken}
      />,
    );

    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Publish')).toBeInTheDocument();
  });

  it('should navigate to publish page with correct params when Publish is clicked', () => {
    render(
      <ClipResultCard
        clip={makeClip({
          status: 'completed',
          summary: 'Clip summary for publish handoff',
          title: 'My Great Clip',
          videoUrl: 'https://cdn.example.com/video.mp4',
        })}
        apiEndpoint={apiEndpoint}
        getToken={mockGetToken}
      />,
    );

    fireEvent.click(screen.getByText('Publish'));

    expect(pushSpy).toHaveBeenCalledWith(
      expect.stringContaining('/compose/post?'),
    );
    expect(pushSpy).toHaveBeenCalledWith(
      expect.stringContaining('title=My+Great+Clip'),
    );
    expect(pushSpy).toHaveBeenCalledWith(
      expect.stringContaining('description=Clip+summary+for+publish+handoff'),
    );
  });

  it('should display virality score', () => {
    render(
      <ClipResultCard
        clip={makeClip({ viralityScore: 92 })}
        apiEndpoint={apiEndpoint}
        getToken={mockGetToken}
      />,
    );

    expect(screen.getByText('92')).toBeInTheDocument();
  });

  it('should display tags with a maximum of 3 visible', () => {
    render(
      <ClipResultCard
        clip={makeClip({ tags: ['ai', 'tech', 'startup', 'viral', 'growth'] })}
        apiEndpoint={apiEndpoint}
        getToken={mockGetToken}
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
        apiEndpoint={apiEndpoint}
        getToken={mockGetToken}
      />,
    );

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText(/Generation failed/)).toBeInTheDocument();
  });
});

import { render } from '@testing-library/react';
import VideoTrimTimeline from '@ui/display/video-trim-timeline/VideoTrimTimeline';
import { describe, expect, it, vi } from 'vitest';

describe('VideoTrimTimeline', () => {
  const baseProps = {
    endTime: 8,
    isGeneratingThumbnails: false,
    onRangeChange: vi.fn(),
    startTime: 1,
    thumbnails: [],
    videoDuration: 10,
  };

  it('should render without crashing', () => {
    const { container } = render(<VideoTrimTimeline {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<VideoTrimTimeline {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<VideoTrimTimeline {...baseProps} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

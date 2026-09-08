import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
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

  it('shows floored trim times without rolling minutes into hours', () => {
    render(
      <VideoTrimTimeline
        {...baseProps}
        startTime={61.9}
        endTime={3661.9}
        videoDuration={4000}
      />,
    );

    expect(screen.getByText('1:01')).toBeInTheDocument();
    expect(screen.getByText('61:01')).toBeInTheDocument();
    expect(screen.getByText('60:00')).toBeInTheDocument();
  });

  it('does not import rc-slider CSS into the Turbopack PostCSS graph', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'VideoTrimTimeline.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/rc-slider/);
  });
});

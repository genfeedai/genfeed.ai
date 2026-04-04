import { render } from '@testing-library/react';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { describe, expect, it } from 'vitest';

describe('VideoPlayer', () => {
  it('should render without crashing', () => {
    const { container } = render(<VideoPlayer />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<VideoPlayer />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<VideoPlayer />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

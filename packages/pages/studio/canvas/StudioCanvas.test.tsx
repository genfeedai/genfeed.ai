import StudioCanvas from '@pages/studio/canvas/StudioCanvas';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('@hooks/studio/use-studio-canvas/use-studio-canvas', () => ({
  useStudioCanvas: vi.fn(() => ({
    canvasRef: { current: null },
    handleCanvasClick: vi.fn(),
    handleCanvasMouseMove: vi.fn(),
  })),
}));

describe('StudioCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<StudioCanvas />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

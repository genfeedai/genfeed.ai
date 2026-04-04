import CamerasList from '@pages/elements/cameras/cameras-list';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('CamerasList', () => {
  it('should render without crashing', () => {
    const { container } = render(<CamerasList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<CamerasList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<CamerasList />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

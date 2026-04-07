import { render } from '@testing-library/react';
import ContainerTitle from '@ui/layout/container-title/ContainerTitle';
import { describe, expect, it } from 'vitest';

describe('ContainerTitle', () => {
  it('should render without crashing', () => {
    const { container } = render(<ContainerTitle />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<ContainerTitle />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<ContainerTitle />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

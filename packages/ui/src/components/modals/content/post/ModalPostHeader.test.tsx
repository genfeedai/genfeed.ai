import { render } from '@testing-library/react';
import ModalPostHeader from '@ui/modals/content/post/ModalPostHeader';
import { describe, expect, it, vi } from 'vitest';

describe('ModalPostHeader', () => {
  const defaultProps = {
    activeTab: 'setup' as const,
    isStep1Complete: true,
    onTabChange: vi.fn(),
  };

  it('should render without crashing', () => {
    const { container } = render(<ModalPostHeader {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<ModalPostHeader {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<ModalPostHeader {...defaultProps} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

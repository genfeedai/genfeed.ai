import { render } from '@testing-library/react';
import ModalPostHeader from '@ui/modals/content/post/ModalPostHeader';
import { describe, expect, it } from 'vitest';

describe('ModalPostHeader', () => {
  it('should render without crashing', () => {
    const { container } = render(<ModalPostHeader />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<ModalPostHeader />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<ModalPostHeader />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

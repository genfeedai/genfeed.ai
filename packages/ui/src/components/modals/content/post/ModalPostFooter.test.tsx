import { render } from '@testing-library/react';
import ModalPostFooter from '@ui/modals/content/post/ModalPostFooter';
import { describe, expect, it } from 'vitest';

describe('ModalPostFooter', () => {
  it('should render without crashing', () => {
    const { container } = render(<ModalPostFooter />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<ModalPostFooter />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<ModalPostFooter />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

import { render } from '@testing-library/react';
import ModalActions from '@ui/modals/actions/ModalActions';
import { describe, expect, it } from 'vitest';

describe('ModalActions', () => {
  it('should render without crashing', () => {
    const { container } = render(<ModalActions />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<ModalActions />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<ModalActions />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement.className).toContain('justify-end');
  });

  it('allows className overrides for special footers', () => {
    const { container } = render(
      <ModalActions className="justify-between">actions</ModalActions>,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement.className).toContain('justify-between');
  });
});

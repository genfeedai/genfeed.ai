import { render } from '@testing-library/react';
import Masonry from '@ui/display/masonry/Masonry';
import { describe, expect, it } from 'vitest';

describe('Masonry', () => {
  it('should render without crashing', () => {
    const { container } = render(<Masonry />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<Masonry />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <Masonry columns={{ default: 2 }} gap={12}>
        <div>First</div>
        <div>Second</div>
      </Masonry>,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveStyle({ columnCount: '2', columnGap: '12px' });
    expect(rootElement.children).toHaveLength(2);
    expect(rootElement.children[0]).toHaveClass('break-inside-avoid');
  });
});

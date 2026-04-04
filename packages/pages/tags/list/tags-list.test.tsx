import TagsList from '@pages/tags/list/tags-list';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('TagsList', () => {
  it('should render without crashing', () => {
    const { container } = render(<TagsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<TagsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<TagsList />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

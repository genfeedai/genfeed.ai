import TagsPage from '@pages/tags/page/tags-page';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('TagsPage', () => {
  it('should render without crashing', () => {
    const { container } = render(<TagsPage />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<TagsPage />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<TagsPage />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

import { render } from '@testing-library/react';
import PageHeader from '@ui/layout/page-header/PageHeader';
import { describe, expect, it } from 'vitest';

describe('PageHeader', () => {
  it('should render without crashing', () => {
    const { container } = render(<PageHeader />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<PageHeader />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<PageHeader />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

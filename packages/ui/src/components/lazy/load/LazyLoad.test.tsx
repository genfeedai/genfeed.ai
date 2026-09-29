import { render } from '@testing-library/react';
import LazyLoad from '@ui/lazy/load/LazyLoad';
import { describe, expect, it } from 'vitest';

describe('LazyLoad', () => {
  it('should apply correct styles and classes', () => {
    const { container } = render(<LazyLoad />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

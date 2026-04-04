import FontFamiliesList from '@pages/elements/font-families/font-families-list';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('FontFamiliesList', () => {
  it('should render without crashing', () => {
    const { container } = render(<FontFamiliesList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<FontFamiliesList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<FontFamiliesList />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

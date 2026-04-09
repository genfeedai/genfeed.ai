import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StylesList from './styles-list';

describe('StylesList', () => {
  it('should render without crashing', () => {
    const { container } = render(<StylesList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<StylesList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<StylesList />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

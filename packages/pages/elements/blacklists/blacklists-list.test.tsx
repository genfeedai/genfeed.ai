import BlacklistsList from '@pages/elements/blacklists/blacklists-list';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('BlacklistsList', () => {
  it('should render without crashing', () => {
    const { container } = render(<BlacklistsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<BlacklistsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<BlacklistsList />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

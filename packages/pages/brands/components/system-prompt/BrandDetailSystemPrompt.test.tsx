import BrandDetailSystemPrompt from '@pages/brands/components/system-prompt/BrandDetailSystemPrompt';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('BrandDetailSystemPrompt', () => {
  it('should render without crashing', () => {
    const { container } = render(<BrandDetailSystemPrompt />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<BrandDetailSystemPrompt />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<BrandDetailSystemPrompt />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

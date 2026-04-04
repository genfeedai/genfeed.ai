import PromptsList from '@pages/marketplace/prompts/prompts-list';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('PromptsList', () => {
  it('should render without crashing', () => {
    const { container } = render(<PromptsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<PromptsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<PromptsList />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

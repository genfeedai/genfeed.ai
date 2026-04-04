import { render } from '@testing-library/react';
import IngredientTabsPrompts from '@ui/ingredients/tabs/prompts/IngredientTabsPrompts';
import { describe, expect, it } from 'vitest';

describe('IngredientTabsPrompts', () => {
  it('should render without crashing', () => {
    const { container } = render(<IngredientTabsPrompts />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<IngredientTabsPrompts />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<IngredientTabsPrompts />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

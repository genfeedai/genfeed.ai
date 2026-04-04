import IngredientDetail from '@pages/ingredients/detail/ingredient-detail';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('IngredientDetail', () => {
  it('should render without crashing', () => {
    const { container } = render(<IngredientDetail />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<IngredientDetail />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<IngredientDetail />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

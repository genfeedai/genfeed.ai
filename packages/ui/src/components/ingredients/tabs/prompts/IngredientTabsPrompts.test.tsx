import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import IngredientTabsPrompts from '@ui/ingredients/tabs/prompts/IngredientTabsPrompts';
import { describe, expect, it } from 'vitest';

describe('IngredientTabsPrompts', () => {
  const ingredient = { id: 'ingredient-1' } as IIngredient;

  it('should render without crashing', () => {
    const { container } = render(
      <IngredientTabsPrompts ingredient={ingredient} />,
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('No prompt available.')).toBeInTheDocument();
  });

  it('shows the original prompt without the redundant context card or empty controls', () => {
    render(
      <IngredientTabsPrompts
        ingredient={
          {
            promptText: 'Imagine a horse.',
            prompt: { style: 'Watercolor' },
          } as IIngredient
        }
      />,
    );
    expect(screen.getByText('Imagine a horse.')).toBeInTheDocument();
    expect(screen.getByText('Watercolor')).toBeInTheDocument();
    expect(screen.queryByText('Prompt Context')).not.toBeInTheDocument();
    expect(screen.queryByText('None')).not.toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <IngredientTabsPrompts ingredient={ingredient} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

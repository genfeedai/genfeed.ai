import type { IIngredient } from '@genfeedai/interfaces';
import { AssetScope, IngredientCategory } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import IngredientTabsSharing from '@ui/ingredients/tabs/sharing/IngredientTabsSharing';
import { describe, expect, it, vi } from 'vitest';

describe('IngredientTabsSharing', () => {
  const ingredient = {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-1',
    scope: AssetScope.USER,
  } as IIngredient;

  it('renders a single access-control heading and grouped selector', () => {
    render(<IngredientTabsSharing ingredient={ingredient} />);

    expect(screen.getAllByText('Access Control')).toHaveLength(1);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('updates sharing scope when a new option is selected', () => {
    const onUpdateSharing = vi.fn();

    render(
      <IngredientTabsSharing
        ingredient={ingredient}
        onUpdateSharing={onUpdateSharing}
      />,
    );

    fireEvent.click(screen.getByLabelText('Public'));

    expect(onUpdateSharing).toHaveBeenCalledWith('scope', AssetScope.PUBLIC);
  });

  it('uses the rounded panel variant for the scope selector', () => {
    const { container } = render(
      <IngredientTabsSharing ingredient={ingredient} />,
    );

    const groupedList = container.querySelector('[role="radiogroup"]');

    expect(groupedList).toHaveClass('rounded-2xl');
    expect(groupedList).toHaveClass('border-white/10');
  });
});

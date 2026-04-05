import '@testing-library/jest-dom';
import type { IIngredient } from '@genfeedai/interfaces';
import { IngredientCategory } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import IngredientQuickActions from '@ui/quick-actions/actions/IngredientQuickActions';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/ui/use-quick-actions/use-quick-actions', () => ({
  useQuickActions: vi.fn(
    (params: {
      hasPromptControl?: boolean;
      hasScopeControl?: boolean;
      hasStatusControl?: boolean;
    }) => {
      const primaryAction = {
        id: 'see-details',
        label: 'Open',
        onClick: vi.fn(),
      };

      const contextActions = [];
      if (params.hasPromptControl) {
        contextActions.push({ id: 'prompt' });
      }
      if (params.hasStatusControl) {
        contextActions.push({ id: 'status' });
      }
      if (params.hasScopeControl) {
        contextActions.push({ id: 'scope' });
      }

      return {
        actions: [primaryAction],
        contextActions,
        mainActions: [primaryAction],
        menuActions: [],
        primaryActions: [primaryAction],
      };
    },
  ),
}));

vi.mock('@ui/dropdowns/prompt/DropdownPrompt', () => ({
  default: () => <div data-testid="dropdown-prompt" />,
}));

vi.mock('@ui/dropdowns/status/DropdownStatus', () => ({
  default: () => <div data-testid="dropdown-status" />,
}));

vi.mock('@ui/dropdowns/scope/DropdownScope', () => ({
  default: () => <div data-testid="dropdown-scope" />,
}));

describe('IngredientQuickActions', () => {
  const ingredient = {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-1',
    promptText: 'test prompt',
  } as IIngredient;

  it('renders the primary action group', () => {
    render(<IngredientQuickActions selectedIngredient={ingredient} />);

    expect(screen.getByTestId('primary-actions-group')).toBeInTheDocument();
  });

  it('renders the quieter context group on non-masonry surfaces', () => {
    render(
      <IngredientQuickActions
        selectedIngredient={ingredient}
        onCopy={vi.fn()}
        onRefresh={vi.fn()}
        onScopeChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('context-actions-group')).toBeInTheDocument();
    expect(screen.getByTestId('dropdown-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('dropdown-status')).toBeInTheDocument();
    expect(screen.getByTestId('dropdown-scope')).toBeInTheDocument();
  });

  it('hides the context group in masonry compact mode', () => {
    render(
      <IngredientQuickActions
        selectedIngredient={ingredient}
        isMasonryCompact
        onCopy={vi.fn()}
        onRefresh={vi.fn()}
        onScopeChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId('context-actions-group'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('dropdown-prompt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dropdown-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dropdown-scope')).not.toBeInTheDocument();
  });
});

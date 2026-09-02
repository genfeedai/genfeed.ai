import '@testing-library/jest-dom/vitest';
import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import IngredientQuickActions from '@ui/quick-actions/actions/IngredientQuickActions';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useQuickActions: vi.fn(),
}));

vi.mock('@genfeedai/hooks/ui/use-quick-actions/use-quick-actions', () => ({
  useQuickActions: vi.fn(
    (params: {
      handlers: { onUsePrompt?: (ingredient: IIngredient) => void };
      hasPromptControl?: boolean;
      hasScopeControl?: boolean;
      hasStatusControl?: boolean;
    }) => {
      mocks.useQuickActions(params);
      const primaryAction = {
        id: 'see-details',
        label: 'Open',
        onClick: vi.fn(),
        variant: 'primary' as const,
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

  it('keeps quick-action shells on the shared radius', () => {
    render(
      <IngredientQuickActions
        selectedIngredient={ingredient}
        onCopy={vi.fn()}
        onRefresh={vi.fn()}
        onScopeChange={vi.fn()}
      />,
    );

    for (const testId of ['primary-actions-group', 'context-actions-group']) {
      const shell = screen.getByTestId(testId);
      expect(shell).toHaveClass('rounded-lg');
      expect(shell.className).not.toContain('rounded-full');
    }
  });

  it('collapses a masonry tile to the overflow menu alone', () => {
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
    expect(
      screen.queryByTestId('primary-actions-group'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('masonry-compact-actions')).toHaveClass(
      'bg-secondary/80',
    );
  });

  it('uses reprompt as the compact masonry use-prompt action', () => {
    const onReprompt = vi.fn();
    mocks.useQuickActions.mockClear();

    render(
      <IngredientQuickActions
        selectedIngredient={ingredient}
        isMasonryCompact
        onReprompt={onReprompt}
      />,
    );

    const params = mocks.useQuickActions.mock.calls.at(-1)?.[0] as {
      handlers: { onUsePrompt?: (ingredient: IIngredient) => void };
    };
    expect(params.handlers.onUsePrompt).toBe(onReprompt);
  });
});

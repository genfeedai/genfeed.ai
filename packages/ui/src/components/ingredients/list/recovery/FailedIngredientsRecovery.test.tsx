import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { FailedIngredientsRecoveryProps } from '@genfeedai/props/content/ingredient-recovery.props';
import { fireEvent, render, screen, within } from '@testing-library/react';
import FailedIngredientsRecovery from '@ui/ingredients/list/recovery/FailedIngredientsRecovery';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  const translate = translateFromCatalog('pages.library.recovery');
  const labels: Record<string, string> = {
    'actions.replaceReference': 'Replace',
    'actions.reviewInputs': 'Review',
    'actions.editPrompt': 'Edit',
    'actions.viewDetails': 'Inspect',
    started: 'Started',
    clear: 'Clear',
  };
  const recoveryTranslate = (...args: Parameters<typeof translate>) =>
    labels[args[0]] ?? translate(...args);
  return {
    useTranslations: (namespace: string) =>
      namespace === 'pages.library.recovery'
        ? recoveryTranslate
        : translateFromCatalog(namespace),
    useFormatter: () => ({ dateTime: () => '5 Oct' }),
  };
});
vi.mock('@genfeedai/hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: () => null,
}));

function asset(id: string, generationError: string): IIngredient {
  return {
    id,
    category: IngredientCategory.IMAGE,
    status: IngredientStatus.FAILED,
    metadataLabel: id,
    generationPrompt: 'Saved prompt',
    modelUsed: 'image-model',
    generationError,
  } as IIngredient;
}

const ingredients = [
  asset('outage', '503 Service unavailable'),
  asset('invalid', 'status 422'),
  asset('ambiguous', 'Processing failed'),
];
let props: FailedIngredientsRecoveryProps;
beforeEach(() => {
  props = {
    ingredients,
    selectedIds: [],
    retriedIds: [],
    isActionsEnabled: true,
    isRecovering: false,
    onSelectionChange: vi.fn(),
    onDelete: vi.fn(),
    onRetry: vi.fn(),
    onInspect: vi.fn(),
    onReview: vi.fn(),
  };
});

describe('Failed shelf recovery view', () => {
  it('puts attention first with no page header or raw provider dump', () => {
    const { container } = render(<FailedIngredientsRecovery {...props} />);
    const groups = [
      ...container.querySelectorAll('[data-testid^="recovery-group-"]'),
    ];
    expect(groups.map((group) => group.getAttribute('data-testid'))).toEqual([
      'recovery-group-attention',
      'recovery-group-retry',
      'recovery-group-unknown',
    ]);
    expect(
      screen.queryByRole('heading', { name: 'Failed' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('status 422')).not.toBeInTheDocument();
    expect(screen.getByText('Inputs need review')).toBeInTheDocument();
  });
  it('deletes all filtered failures without replacing the current selection', () => {
    render(<FailedIngredientsRecovery {...props} selectedIds={['invalid']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete all (3)' }));
    expect(props.onDelete).toHaveBeenCalledWith([
      'outage',
      'invalid',
      'ambiguous',
    ]);
    expect(props.onSelectionChange).not.toHaveBeenCalled();
  });
  it('keeps individual deletion and recovery separate from inspection', () => {
    render(<FailedIngredientsRecovery {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete invalid' }));
    expect(props.onDelete).toHaveBeenCalledWith(['invalid']);
    expect(props.onInspect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(props.onReview).toHaveBeenCalledWith(ingredients[1]);
  });
  it('only deletes the visible selection and retries eligible requests once', () => {
    render(
      <FailedIngredientsRecovery
        {...props}
        selectedIds={['invalid', 'outside-filter']}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    expect(props.onDelete).toHaveBeenCalledWith(['invalid']);
    fireEvent.click(screen.getByRole('button', { name: 'Retry these 1' }));
    expect(props.onRetry).toHaveBeenCalledWith([ingredients[0]]);
  });
  it('disables actions during recovery and lets unknown failures disclose details', () => {
    render(<FailedIngredientsRecovery {...props} isRecovering />);
    expect(
      screen.getByRole('button', { name: 'Delete all (3)' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Retry these 1' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Unclear failure/ }));
    expect(
      within(screen.getByTestId('recovery-group-unknown')).getByRole('button', {
        name: 'Inspect',
      }),
    ).toBeInTheDocument();
  });
  it('publishes Delete all in the existing toolbar slot', () => {
    const slot = document.createElement('div');
    document.body.append(slot);
    render(<FailedIngredientsRecovery {...props} actionSlot={slot} />);
    expect(
      within(slot).getByRole('button', { name: 'Delete all (3)' }),
    ).toBeInTheDocument();
    slot.remove();
  });
});

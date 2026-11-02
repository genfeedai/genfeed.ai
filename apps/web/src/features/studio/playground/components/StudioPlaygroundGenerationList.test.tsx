import '@testing-library/jest-dom/vitest';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudioPlaygroundGenerationList from '@/features/studio/playground/components/StudioPlaygroundGenerationList';
import type { StudioPlaygroundAssetActions } from '@/features/studio/props/studio-playground.props';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useLocale: () => 'en', useTranslations: translateFromCatalog };
});
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
    orgHref: (path: string) => `/acme/~${path}`,
  }),
}));
vi.mock('@hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: () => null,
}));

function actions(
  overrides: Partial<StudioPlaygroundAssetActions> = {},
): StudioPlaygroundAssetActions {
  return {
    onClickIngredient: vi.fn(),
    onConvertToVideo: vi.fn(),
    onCopyPrompt: vi.fn(),
    onCreateVariation: vi.fn(),
    onDeleteIngredient: vi.fn(),
    onMarkArchived: vi.fn(),
    onMarkRejected: vi.fn(),
    onMarkValidated: vi.fn(),
    onOpenInEditor: vi.fn(),
    onPublishIngredient: vi.fn(),
    onRefresh: vi.fn(),
    onRemoveGeneration: vi.fn(),
    onResize: vi.fn(),
    onSeeDetails: vi.fn(),
    onToggleFavorite: vi.fn(),
    onUseAsVideoReference: vi.fn(),
    ...overrides,
  };
}

describe('StudioPlaygroundGenerationList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a skeleton while the gallery is still loading', () => {
    render(
      <StudioPlaygroundGenerationList
        assetActions={actions()}
        isLoading
        jobs={[]}
        onReprompt={vi.fn()}
      />,
    );

    expect(screen.getByTestId('studio-results-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument();
  });

  it('says so when nothing has been generated yet', () => {
    render(
      <StudioPlaygroundGenerationList
        assetActions={actions()}
        isLoading={false}
        jobs={[]}
        onReprompt={vi.fn()}
      />,
    );

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Write a prompt below and everything you generate lands here.',
      ),
    ).toBeInTheDocument();
  });

  it('links each generation to its own page', () => {
    render(
      <StudioPlaygroundGenerationList
        assetActions={actions()}
        isLoading={false}
        jobs={[
          {
            createdAt: 1,
            id: 'asset-1',
            modelKey: 'flux-pro',
            prompt: 'A sunlit desk',
            status: IngredientStatus.GENERATED,
            type: 'image',
          },
        ]}
        onReprompt={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('link', {
        name: 'Inspect Image generation: Image asset-1',
      }),
    ).toHaveAttribute('href', '/acme/moonrise/playground/asset-1');
    expect(screen.getByText('flux-pro')).toBeInTheDocument();
  });

  it('marks a queued generation and offers Stop', async () => {
    const onCancelGeneration = vi.fn();
    render(
      <StudioPlaygroundGenerationList
        assetActions={actions({ onCancelGeneration })}
        isLoading={false}
        jobs={[
          {
            createdAt: 1,
            id: 'queued-1',
            ingredientId: 'queued-1',
            prompt: 'Queued prompt',
            status: IngredientStatus.PROCESSING,
            type: 'video',
          },
        ]}
        onReprompt={vi.fn()}
      />,
    );

    expect(screen.getByText('Generating…')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /^Actions for / }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Stop generation' }),
    );

    expect(onCancelGeneration).toHaveBeenCalledTimes(1);
  });

  it('marks a failed generation and removes it from the menu', async () => {
    const onRemoveGeneration = vi.fn();
    const onReprompt = vi.fn();
    const job = {
      createdAt: 1,
      id: 'failed-1',
      prompt: 'Failed prompt',
      status: IngredientStatus.FAILED,
      type: 'image' as const,
    };
    render(
      <StudioPlaygroundGenerationList
        assetActions={actions({ onRemoveGeneration })}
        isLoading={false}
        jobs={[job]}
        onReprompt={onReprompt}
      />,
    );

    expect(screen.getByText('Failed')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /^Actions for / }),
    );
    expect(
      screen.queryByRole('menuitem', { name: 'Stop generation' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));

    expect(onRemoveGeneration).toHaveBeenCalledWith(job);
  });

  it('offers the recovery action a failed saved generation needs', async () => {
    const onRetryFailedIngredient = vi.fn();
    const ingredient = {
      category: IngredientCategory.IMAGE,
      generationError: '503 service unavailable',
      id: 'failed-2',
      isDeleted: false,
      modelUsed: 'flux-pro',
      promptText: 'Failed saved prompt',
      status: IngredientStatus.FAILED,
    } as IIngredient;
    render(
      <StudioPlaygroundGenerationList
        assetActions={actions({
          failedRecovery: {
            isRecovering: false,
            onRetryFailedIngredient,
            onReviewFailedIngredient: vi.fn().mockResolvedValue(undefined),
            retriedIds: [],
          },
        })}
        isLoading={false}
        jobs={[
          {
            createdAt: 1,
            id: 'failed-2',
            ingredient,
            ingredientId: 'failed-2',
            prompt: 'Failed saved prompt',
            status: IngredientStatus.FAILED,
            type: 'image',
          },
        ]}
        onReprompt={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /^Actions for / }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Retry' }));

    expect(onRetryFailedIngredient).toHaveBeenCalledWith(ingredient);
  });
});

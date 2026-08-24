import { IngredientStatus, ViewType } from '@genfeedai/enums';
import type { StudioGenerateAssetActions } from '@genfeedai/props/studio/studio-generate.props';
import StudioGenerateResults from '@pages/studio/generate/components/StudioGenerateResults';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@pages/studio/generate/components/StudioGenerateCard', () => ({
  default: ({ job }: { job: { id: string } }) => <div>{job.id}</div>,
}));

vi.mock('@ui/display/masonry/Masonry', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="studio-masonry">{children}</div>
  ),
}));

const assetActions = {
  onClickIngredient: vi.fn(),
  onConvertToVideo: vi.fn(),
  onCopyPrompt: vi.fn(),
  onCreateVariation: vi.fn(),
  onDeleteIngredient: vi.fn(),
  onMarkArchived: vi.fn(),
  onMarkRejected: vi.fn(),
  onMarkValidated: vi.fn(),
  onPublishIngredient: vi.fn(),
  onRefresh: vi.fn(),
  onRemoveGeneration: vi.fn(),
  onSeeDetails: vi.fn(),
  onToggleFavorite: vi.fn(),
  onUseAsVideoReference: vi.fn(),
} satisfies StudioGenerateAssetActions;

describe('StudioGenerateResults', () => {
  it('uses the shared masonry gallery for generated assets', () => {
    render(
      <StudioGenerateResults
        assetActions={assetActions}
        isLoading={false}
        jobs={[
          {
            createdAt: 1,
            id: 'asset-1',
            prompt: 'Prompt',
            status: IngredientStatus.GENERATED,
            type: 'image',
          },
        ]}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        view={ViewType.MASONRY}
      />,
    );

    expect(screen.getByTestId('studio-masonry')).toBeInTheDocument();
    expect(screen.getByText('asset-1')).toBeInTheDocument();
  });

  it('groups N outputs from one submit under a single run', () => {
    render(
      <StudioGenerateResults
        assetActions={assetActions}
        isLoading={false}
        jobs={[
          {
            createdAt: 4,
            id: 'a',
            prompt: 'Prompt',
            runId: 'run-1',
            status: IngredientStatus.GENERATED,
            type: 'image',
          },
          {
            createdAt: 3,
            id: 'b',
            prompt: 'Prompt',
            runId: 'run-1',
            status: IngredientStatus.GENERATED,
            type: 'image',
          },
          {
            createdAt: 2,
            id: 'c',
            prompt: 'Prompt',
            runId: 'run-1',
            status: IngredientStatus.GENERATED,
            type: 'image',
          },
          {
            createdAt: 1,
            id: 'd',
            prompt: 'Prompt',
            runId: 'run-1',
            status: IngredientStatus.GENERATED,
            type: 'image',
          },
        ]}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        view={ViewType.MASONRY}
      />,
    );

    const run = screen.getByTestId('studio-run-run-1');
    expect(run).toHaveAttribute('data-run-count', '4');
    expect(run).toHaveTextContent('4 outputs');
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('d')).toBeInTheDocument();
  });

  it('offers a uniform grid of the results sheet', () => {
    render(
      <StudioGenerateResults
        assetActions={assetActions}
        isLoading={false}
        jobs={[
          {
            createdAt: 1,
            id: 'asset-1',
            prompt: 'Prompt',
            status: IngredientStatus.GENERATED,
            type: 'image',
          },
        ]}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        view={ViewType.GRID}
      />,
    );

    expect(screen.getByTestId('studio-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('studio-masonry')).toBeNull();
    expect(screen.getByTestId('studio-generate-results')).toHaveAttribute(
      'data-results-view',
      'grid',
    );
  });
});

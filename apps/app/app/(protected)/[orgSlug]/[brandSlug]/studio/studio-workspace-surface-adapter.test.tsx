import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  useWorkspaceSurfaceAdapter,
  WorkspaceSurfaceAdapterProvider,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';
import StudioWorkspaceSurfaceAdapter from './studio-workspace-surface-adapter';

const mocks = vi.hoisted(() => ({
  assetSelection: vi.fn(),
  brand: vi.fn(),
}));

vi.mock('@contexts/ui/asset-selection.context', () => ({
  useAssetSelection: mocks.assetSelection,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: mocks.brand,
}));

function ingredient(overrides: Partial<IIngredient> = {}): IIngredient {
  return {
    brand: 'brand-1',
    category: IngredientCategory.IMAGE,
    createdAt: '2026-07-13T10:00:00.000Z',
    hasVoted: false,
    id: 'ingredient-v3',
    isDefault: false,
    isDeleted: false,
    isFavorite: false,
    isHighlighted: false,
    isVoteAnimating: false,
    metadataLabel: 'Launch visual',
    metadataModelLabel: 'Flux Pro',
    organization: 'organization-1',
    scope: 'brand' as IIngredient['scope'],
    status: IngredientStatus.GENERATED,
    totalChildren: 0,
    totalVotes: 0,
    updatedAt: '2026-07-13T10:00:00.000Z',
    user: 'user-1',
    version: 3,
    ...overrides,
  };
}

function InspectorConsumer() {
  const registration = useWorkspaceSurfaceAdapter();
  return (
    <div>
      <span data-testid="adapter-context">{registration?.contextLabel}</span>
      <span data-testid="adapter-reference">
        {registration?.references[0]?.reference.recordId}
      </span>
      {registration?.renderInspector()}
    </div>
  );
}

function setup(overrides: { error?: string; isProcessing?: boolean } = {}) {
  const selectedAsset = ingredient();
  mocks.brand.mockReturnValue({
    brandId: 'brand-1',
    organizationId: 'organization-1',
    selectedBrand: { label: 'Moonrise' },
  });
  mocks.assetSelection.mockReturnValue({
    activeGenerations: overrides.isProcessing
      ? [
          {
            currentPhase: 'Rendering',
            id: 'generation-1',
            model: 'Flux Pro',
            prompt: 'Launch visual',
            startTime: new Date('2026-07-13T10:00:00.000Z'),
            status: [IngredientStatus.PROCESSING],
            type: 'image',
          },
        ]
      : [],
    currentFormat: { height: 1920, width: 1080 },
    generationQueue: [],
    selectedCanonicalAsset: {
      asset: selectedAsset,
      reference: {
        brandId: 'brand-1',
        kind: 'ingredient',
        organizationId: 'organization-1',
        recordId: selectedAsset.id,
        serializer: 'ingredient',
      },
      version: { id: selectedAsset.id, number: 3 },
    },
  });

  render(
    <WorkspaceSurfaceAdapterProvider>
      <StudioWorkspaceSurfaceAdapter
        error={overrides.error}
        isProcessing={overrides.isProcessing}
        mode="image"
        versions={[ingredient({ id: 'ingredient-v2', version: 2 })]}
      />
      <InspectorConsumer />
    </WorkspaceSurfaceAdapterProvider>,
  );
}

describe('StudioWorkspaceSurfaceAdapter', () => {
  it('synchronizes the selected canonical version into inspector and composer data', () => {
    setup();

    expect(screen.getByTestId('adapter-context')).toHaveTextContent(
      'Studio · Image · Launch visual',
    );
    expect(screen.getByTestId('adapter-reference')).toHaveTextContent(
      'ingredient-v3',
    );
    expect(screen.getByText('Selected canonical asset')).toBeInTheDocument();
    expect(screen.getByText('Image · v3')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(
      screen.getByText(/No immutable approval pin is created/i),
    ).toBeVisible();
  });

  it('exposes generation and error state without replacing direct Studio controls', () => {
    setup({ error: 'Failed to restore asset', isProcessing: true });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to restore asset',
    );
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByTestId('adapter-reference')).toBeEmptyDOMElement();
  });
});

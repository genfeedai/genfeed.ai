import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
  useContextSidebar,
} from '@contexts/ui/context-sidebar-context';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  selectedIngredient: null as null | { id: string; metadataLabel: string },
  setSelectedAsset: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1', organizationId: 'org-1' }),
}));

vi.mock('@contexts/ui/asset-selection.context', () => ({
  useAssetSelection: () => ({
    selectedCanonicalAsset: null,
    selectedIngredient: mocks.selectedIngredient,
    setSelectedAsset: mocks.setSelectedAsset,
  }),
}));

vi.mock('@/components/workspace-shell/WorkspaceSurfaceAdapterContext', () => ({
  useRegisterWorkspaceSurfaceAdapter: vi.fn(),
}));

vi.mock('@ui/ingredients/inspector/IngredientInspectorRail', () => ({
  default: ({ ingredient }: { ingredient: { metadataLabel: string } }) => (
    <div>Rail: {ingredient.metadataLabel}</div>
  ),
}));

import LibraryWorkspaceSurfaceAdapter from './library-workspace-surface-adapter';

function CloseControl() {
  const contextSidebar = useContextSidebar();

  return (
    <button type="button" onClick={contextSidebar?.close}>
      Close sidebar
    </button>
  );
}

function renderAdapter() {
  return render(
    <ContextSidebarProvider>
      <CloseControl />
      <ContextSidebarOutlet testId="context-sidebar-outlet" />
      <LibraryWorkspaceSurfaceAdapter />
    </ContextSidebarProvider>,
  );
}

describe('LibraryWorkspaceSurfaceAdapter', () => {
  beforeEach(() => {
    mocks.selectedIngredient = null;
    mocks.setSelectedAsset.mockClear();
  });

  it('renders nothing into the sidebar without a selected asset', () => {
    renderAdapter();

    expect(screen.getByTestId('context-sidebar-outlet')).toBeEmptyDOMElement();
  });

  it('renders the selected asset and clears the shared selection on close', () => {
    mocks.selectedIngredient = { id: 'asset-1', metadataLabel: 'Launch still' };
    renderAdapter();

    expect(screen.getByTestId('context-sidebar-outlet')).toHaveTextContent(
      'Rail: Launch still',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));
    expect(mocks.setSelectedAsset).toHaveBeenCalledWith(null);
  });
});

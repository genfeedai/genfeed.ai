import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
  useContextSidebar,
} from '@genfeedai/contexts/ui/context-sidebar-context';
import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/acme/brand/library/assets',
  requestLightbox: vi.fn(),
  selectedIngredient: null as IIngredient | null,
  setSelectedAsset: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@genfeedai/contexts/ui/asset-selection.context', () => ({
  useAssetSelection: () => ({
    requestLightbox: mocks.requestLightbox,
    selectedIngredient: mocks.selectedIngredient,
    setSelectedAsset: mocks.setSelectedAsset,
  }),
}));

vi.mock('@ui/ingredients/inspector/IngredientInspectorRail', () => ({
  default: ({
    detailHref,
    ingredient,
    onOpenPreview,
  }: {
    detailHref?: string;
    ingredient: { metadataLabel: string };
    onOpenPreview?: () => void;
  }) => (
    <div>
      <span>Rail: {ingredient.metadataLabel}</span>
      <span data-testid="detail-href">{detailHref ?? 'none'}</span>
      <input
        aria-label="open-preview"
        disabled={!onOpenPreview}
        onClick={onOpenPreview}
        type="checkbox"
      />
    </div>
  ),
}));

// The panel loads the rail lazily; resolve it synchronously for the test.
vi.mock('next/dynamic', async () => {
  const { default: Rail } = await import(
    '@ui/ingredients/inspector/IngredientInspectorRail'
  );
  return { default: () => Rail };
});

import IngredientSidebarPanel from './IngredientSidebarPanel';

const ingredient = {
  category: IngredientCategory.IMAGE,
  id: 'asset-1',
  metadataLabel: 'Launch still',
} as IIngredient;

function CloseControl() {
  const contextSidebar = useContextSidebar();

  return (
    <button type="button" onClick={contextSidebar?.close}>
      Close sidebar
    </button>
  );
}

function renderPanel() {
  return render(
    <ContextSidebarProvider>
      <CloseControl />
      <ContextSidebarOutlet testId="context-sidebar-outlet" />
      <IngredientSidebarPanel />
    </ContextSidebarProvider>,
  );
}

describe('IngredientSidebarPanel', () => {
  beforeEach(() => {
    mocks.pathname = '/acme/brand/library/assets';
    mocks.requestLightbox.mockClear();
    mocks.selectedIngredient = null;
    mocks.setSelectedAsset.mockClear();
  });

  it('renders nothing into the sidebar without a selected ingredient', () => {
    renderPanel();

    expect(screen.getByTestId('context-sidebar-outlet')).toBeEmptyDOMElement();
  });

  it('renders the selected ingredient and clears the selection on close', async () => {
    mocks.selectedIngredient = ingredient;
    renderPanel();

    expect(await screen.findByText('Rail: Launch still')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));
    expect(mocks.setSelectedAsset).toHaveBeenCalledWith(null);
  });

  it('offers the full-size preview only where a list answers the request', async () => {
    mocks.selectedIngredient = ingredient;
    const { unmount } = renderPanel();

    const preview = await screen.findByRole('checkbox', {
      name: 'open-preview',
    });
    expect(preview).toBeEnabled();
    fireEvent.click(preview);
    expect(mocks.requestLightbox).toHaveBeenCalledWith(ingredient);
    unmount();

    mocks.pathname = '/acme/brand/publishing/posts';
    renderPanel();
    expect(
      await screen.findByRole('checkbox', { name: 'open-preview' }),
    ).toBeDisabled();
  });

  it('links the admin ingredient to its admin page', async () => {
    mocks.pathname = '/admin/content/ingredients';
    mocks.selectedIngredient = ingredient;
    renderPanel();

    expect(await screen.findByTestId('detail-href')).toHaveTextContent(
      '/admin/images/asset-1',
    );
  });

  it('has no page to link outside the admin', async () => {
    mocks.selectedIngredient = ingredient;
    renderPanel();

    expect(await screen.findByTestId('detail-href')).toHaveTextContent('none');
  });

  it('drops the selection when the route changes', () => {
    mocks.selectedIngredient = ingredient;
    const { rerender } = renderPanel();
    expect(mocks.setSelectedAsset).not.toHaveBeenCalled();

    mocks.pathname = '/acme/brand/publishing/posts';
    rerender(
      <ContextSidebarProvider>
        <CloseControl />
        <ContextSidebarOutlet testId="context-sidebar-outlet" />
        <IngredientSidebarPanel />
      </ContextSidebarProvider>,
    );
    expect(mocks.setSelectedAsset).toHaveBeenCalledWith(null);
  });
});

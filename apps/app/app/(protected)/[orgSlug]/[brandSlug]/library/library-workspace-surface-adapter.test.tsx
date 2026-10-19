import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  selectedCanonicalAsset: null as null | { reference: { id: string } },
  selectedIngredient: null as null | { id: string; metadataLabel: string },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1', organizationId: 'org-1' }),
}));

vi.mock('@contexts/ui/asset-selection.context', () => ({
  useAssetSelection: () => ({
    selectedCanonicalAsset: mocks.selectedCanonicalAsset,
    selectedIngredient: mocks.selectedIngredient,
  }),
}));

vi.mock('@/components/workspace-shell/WorkspaceSurfaceAdapterContext', () => ({
  useRegisterWorkspaceSurfaceAdapter: mocks.register,
}));

import LibraryWorkspaceSurfaceAdapter from './library-workspace-surface-adapter';

describe('LibraryWorkspaceSurfaceAdapter', () => {
  beforeEach(() => {
    mocks.register.mockClear();
    mocks.selectedCanonicalAsset = null;
    mocks.selectedIngredient = null;
  });

  it('registers the library surface without a selected asset', () => {
    const { container } = render(<LibraryWorkspaceSurfaceAdapter />);

    expect(container).toBeEmptyDOMElement();
    expect(mocks.register).toHaveBeenLastCalledWith({
      contextLabel: 'surface',
      references: [],
      scope: { brandId: 'brand-1', organizationId: 'org-1' },
      surfaceKey: 'library',
    });
  });

  it('hands the selected asset to the composer as a reference', () => {
    mocks.selectedIngredient = { id: 'asset-1', metadataLabel: 'Launch still' };
    mocks.selectedCanonicalAsset = { reference: { id: 'asset-1' } };
    render(<LibraryWorkspaceSurfaceAdapter />);

    expect(mocks.register).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contextLabel: 'surface · Launch still',
        references: [{ label: 'Launch still', reference: { id: 'asset-1' } }],
      }),
    );
  });
});

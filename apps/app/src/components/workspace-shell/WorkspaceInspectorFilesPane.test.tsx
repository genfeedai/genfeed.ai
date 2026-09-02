import '@testing-library/jest-dom/vitest';
import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UseLibraryPickerResult } from '@/features/library-remix/use-library-picker';

const mocks = vi.hoisted(() => ({
  dispatchOpenBrowserTab: vi.fn(),
  result: null as UseLibraryPickerResult | null,
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/moonrise${path}` }),
}));

vi.mock('@/features/library-remix/LibrarySourcePreview', () => ({
  default: ({ record }: { record: IIngredient }) => (
    <div data-testid={`source-preview-${record.id}`} />
  ),
  getLibrarySourceLabel: (record: IIngredient) =>
    record.metadataLabel || record.id,
}));

vi.mock('@/features/library-remix/use-library-picker', () => ({
  LIBRARY_PICKER_CATEGORIES: [
    { category: 'image', key: 'images', label: 'Images' },
    { category: 'video', key: 'videos', label: 'Videos' },
    { category: 'gif', key: 'gifs', label: 'GIFs' },
  ],
  useLibraryPicker: (params: {
    onSelect: (reference: unknown, record: IIngredient) => void;
  }) => {
    if (!mocks.result) {
      throw new Error('Picker test state was not initialized.');
    }

    return {
      ...mocks.result,
      select: async (ingredient: IIngredient) => {
        await mocks.result?.select(ingredient);
        params.onSelect(
          {
            brandId: 'brand-1',
            kind: 'ingredient',
            organizationId: 'org-1',
            recordId: ingredient.id,
            serializer: 'ingredient',
          },
          ingredient,
        );
      },
    };
  },
}));

vi.mock('@/lib/workspace/agent-composer-events', () => ({
  dispatchOpenBrowserTab: () => mocks.dispatchOpenBrowserTab(),
  dispatchOpenFilesTab: vi.fn(),
  OPEN_BROWSER_TAB_EVENT: 'workspace:open-browser-tab',
  OPEN_FILES_TAB_EVENT: 'workspace:open-files-tab',
}));

import WorkspaceInspectorFilesPane from './WorkspaceInspectorFilesPane';
import { WorkspaceInspectorPreviewProvider } from './WorkspaceInspectorPreviewContext';

function ingredient(id: string): IIngredient {
  return {
    category: IngredientCategory.IMAGE,
    id,
    ingredientUrl: `https://cdn.example/${id}.jpg`,
    metadataLabel: `Source ${id}`,
  } as IIngredient;
}

function pickerResult(
  overrides: Partial<UseLibraryPickerResult> = {},
): UseLibraryPickerResult {
  return {
    category: 'images',
    isLoadingMore: false,
    isValidatingId: null,
    loadMore: vi.fn(),
    retry: vi.fn(),
    select: vi.fn(),
    selectionFailure: null,
    setCategory: vi.fn(),
    state: { hasMore: false, items: [], status: 'empty', total: 0 },
    ...overrides,
  };
}

describe('WorkspaceInspectorFilesPane', () => {
  beforeEach(() => {
    mocks.dispatchOpenBrowserTab.mockReset();
    mocks.result = pickerResult();
  });

  it('lists brand library sources and opens Browser on select', async () => {
    const source = ingredient('image-1');
    mocks.result = pickerResult({
      state: {
        hasMore: false,
        items: [source],
        status: 'ready',
        total: 1,
      },
    });

    render(
      <WorkspaceInspectorPreviewProvider>
        <WorkspaceInspectorFilesPane />
      </WorkspaceInspectorPreviewProvider>,
    );

    expect(screen.getByTestId('source-preview-image-1')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Manage Library' }),
    ).toHaveAttribute('href', '/acme/moonrise/library/images');
    expect(screen.getByRole('button', { name: 'Images' })).toHaveAttribute(
      'data-variant',
      'underline',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Select Source image-1' }),
    );

    await waitFor(() => {
      expect(mocks.dispatchOpenBrowserTab).toHaveBeenCalledTimes(1);
    });
    expect(mocks.result.select).toHaveBeenCalledWith(source);
  });

  it('sends Manage Library to the active category and keeps underline filters', () => {
    mocks.result = pickerResult({ category: 'videos' });

    render(
      <WorkspaceInspectorPreviewProvider>
        <WorkspaceInspectorFilesPane />
      </WorkspaceInspectorPreviewProvider>,
    );

    expect(
      screen.getByRole('link', { name: 'Manage Library' }),
    ).toHaveAttribute('href', '/acme/moonrise/library/videos');
    expect(screen.getByRole('button', { name: 'Videos' })).toHaveAttribute(
      'data-variant',
      'underline',
    );
    expect(screen.getByRole('button', { name: 'Images' })).toHaveAttribute(
      'data-variant',
      'underline',
    );
  });
});

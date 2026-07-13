import '@testing-library/jest-dom/vitest';
import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseLibraryPickerResult } from './use-library-picker';

const mocks = vi.hoisted(() => ({
  result: null as UseLibraryPickerResult | null,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/moonrise${path}` }),
}));

vi.mock('./LibrarySourcePreview', () => ({
  default: ({ record }: { record: IIngredient }) => (
    <div data-testid={`source-preview-${record.id}`} />
  ),
  getLibrarySourceLabel: (record: IIngredient) =>
    record.metadataLabel || record.id,
}));

vi.mock('./use-library-picker', () => ({
  LIBRARY_PICKER_CATEGORIES: [
    { category: 'image', key: 'images', label: 'Images' },
    { category: 'video', key: 'videos', label: 'Videos' },
    { category: 'gif', key: 'gifs', label: 'GIFs' },
  ],
  useLibraryPicker: () => {
    if (!mocks.result) {
      throw new Error('Picker test state was not initialized.');
    }
    return mocks.result;
  },
}));

import LibraryPickerOverlay from './LibraryPickerOverlay';

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

describe('LibraryPickerOverlay', () => {
  beforeEach(() => {
    mocks.result = pickerResult();
  });

  it('renders bounded loading, empty, and permission states', () => {
    mocks.result = pickerResult({
      state: { hasMore: false, items: [], status: 'loading', total: 0 },
    });
    const view = render(
      <LibraryPickerOverlay onSelect={vi.fn()} threadId="thread-1" />,
    );
    expect(
      screen.getByLabelText('Loading Library sources'),
    ).toBeInTheDocument();

    mocks.result = pickerResult();
    view.rerender(
      <LibraryPickerOverlay onSelect={vi.fn()} threadId="thread-1" />,
    );
    expect(screen.getByText('No images available')).toBeInTheDocument();

    mocks.result = pickerResult({
      state: {
        hasMore: false,
        items: [],
        status: 'permission-denied',
        total: 0,
      },
    });
    view.rerender(
      <LibraryPickerOverlay onSelect={vi.fn()} threadId="thread-1" />,
    );
    expect(
      screen.getByText(/unavailable for the effective brand/i),
    ).toBeInTheDocument();
  });

  it('renders media incrementally and revalidates the chosen record', () => {
    const source = ingredient('image-1');
    const loadMore = vi.fn();
    const select = vi.fn();
    mocks.result = pickerResult({
      loadMore,
      select,
      state: {
        hasMore: true,
        items: [source],
        status: 'ready',
        total: 75,
      },
    });

    render(<LibraryPickerOverlay onSelect={vi.fn()} threadId="thread-1" />);

    expect(screen.getByTestId('source-preview-image-1')).toBeInTheDocument();
    expect(
      screen.getByText('75 Library sources available'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /manage library/i }),
    ).toHaveAttribute(
      'href',
      '/acme/moonrise/library/ingredients?thread=thread-1',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Select Source image-1' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(select).toHaveBeenCalledWith(source);
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('keeps stale selection failures recoverable in the overlay', () => {
    mocks.result = pickerResult({ selectionFailure: 'stale' });

    render(<LibraryPickerOverlay onSelect={vi.fn()} />);

    expect(
      screen.getByText(/source is no longer available/i),
    ).toBeInTheDocument();
  });
});

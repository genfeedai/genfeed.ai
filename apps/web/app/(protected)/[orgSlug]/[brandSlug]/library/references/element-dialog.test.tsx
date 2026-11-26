// @vitest-environment jsdom
'use client';

import { LibraryElementType } from '@genfeedai/contracts';
import { LibraryElement } from '@services/content/library-elements.service';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ElementDialog from './element-dialog';

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-src={src}>{alt}</span>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const translate = translateFromCatalog('pages.library.references.elements');
  return { useTranslations: () => translate };
});

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useGalleryModal: () => ({ openGallery: vi.fn() }),
  }),
);

vi.mock('@/hooks/media/use-ingredients-by-id', () => ({
  useIngredientsById: () => new Map(),
}));

function setup(element?: LibraryElement) {
  const onClose = vi.fn();
  const onCreate = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  render(
    <ElementDialog
      element={element}
      isBusy={false}
      onClose={onClose}
      onCreate={onCreate}
      onUpdate={onUpdate}
    />,
  );
  return { onClose, onCreate, onUpdate };
}

describe('ElementDialog', () => {
  it('creates a prop with a normalized handle', async () => {
    const { onClose, onCreate } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Prop' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: ' Black mug ' },
    });
    fireEvent.change(screen.getByLabelText('Handle'), {
      target: { value: '@Black-Mug' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create element' }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        description: '',
        handle: 'black-mug',
        label: 'Black mug',
        referenceIngredientIds: [],
        type: LibraryElementType.PROP,
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks for a name and a valid handle before saving', () => {
    const { onCreate } = setup();

    fireEvent.change(screen.getByLabelText('Handle'), {
      target: { value: 'not a handle!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create element' }));

    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(
      screen.getByText(/Handle must be 2–32 characters/),
    ).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('saves edits to an existing element without changing its type', async () => {
    const { onUpdate } = setup(
      new LibraryElement({
        description: 'Brick walls',
        handle: 'loft-studio',
        id: 'el-1',
        kind: 'LOCATION',
        label: 'Loft studio',
        referenceIngredientIds: ['img-1'],
      }),
    );

    expect(
      screen.queryByRole('button', { name: 'Prop' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Loft studio, evening' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('el-1', {
        description: 'Brick walls',
        handle: 'loft-studio',
        label: 'Loft studio, evening',
        referenceIngredientIds: ['img-1'],
      }),
    );
  });
});

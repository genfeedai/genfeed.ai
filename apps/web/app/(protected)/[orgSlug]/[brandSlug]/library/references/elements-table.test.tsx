// @vitest-environment jsdom
'use client';

import { LibraryElement } from '@services/content/library-elements.service';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ElementsTable from './elements-table';

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

vi.mock('@/hooks/media/use-ingredients-by-id', () => ({
  useIngredientsById: () => new Map(),
}));

const loft = new LibraryElement({
  coverIngredientId: 'img-1',
  handle: 'loft-studio',
  id: 'el-1',
  kind: 'LOCATION',
  label: 'Loft studio',
  referenceIngredientIds: ['img-1', 'img-2'],
});

describe('ElementsTable', () => {
  it('shows the name, handle, type and file count of each element', () => {
    render(
      <ElementsTable
        elements={[loft]}
        isLoading={false}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText('Loft studio')).toBeInTheDocument();
    expect(screen.getByText('@loft-studio')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Reference file 2 of Loft studio' }),
    ).toBeInTheDocument();
  });

  it('edits and removes the element of the clicked row', () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    render(
      <ElementsTable
        elements={[loft]}
        isLoading={false}
        onEdit={onEdit}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Loft studio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Loft studio' }));

    expect(onEdit).toHaveBeenCalledWith(loft);
    expect(onRemove).toHaveBeenCalledWith(loft);
  });

  it('offers to create the first element when the list is empty', () => {
    const onCreate = vi.fn();
    render(
      <ElementsTable
        elements={[]}
        isLoading={false}
        onCreate={onCreate}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /New element/ }));

    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

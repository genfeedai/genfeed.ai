import '@testing-library/jest-dom/vitest';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PostMediaStrip from '@/features/posts/components/card-footer/PostMediaStrip';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/ingredients/ingredient-thumbnail/IngredientThumbnail', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

const media = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as IIngredient[];
const ids = (list: IIngredient[]) => list.map((item) => item.id);

describe('PostMediaStrip', () => {
  it('shows every attached item in order', () => {
    render(<PostMediaStrip media={media} onChange={vi.fn()} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(
      screen.getByRole('img', { name: 'Attached media 3' }),
    ).toBeInTheDocument();
  });

  it('moves an item later with its button', () => {
    const onChange = vi.fn();
    render(<PostMediaStrip media={media} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Move media 1 later' }));

    expect(ids(onChange.mock.calls[0][0])).toEqual(['b', 'a', 'c']);
  });

  it('cannot move the first item earlier or the last later', () => {
    render(<PostMediaStrip media={media} onChange={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Move media 1 earlier' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move media 3 later' }),
    ).toBeDisabled();
  });

  it('removes an item', () => {
    const onChange = vi.fn();
    render(<PostMediaStrip media={media} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove media 2' }));

    expect(ids(onChange.mock.calls[0][0])).toEqual(['a', 'c']);
  });

  it('reorders by dragging a tile onto another', () => {
    const onChange = vi.fn();
    render(<PostMediaStrip media={media} onChange={onChange} />);
    const tiles = screen.getAllByRole('listitem');

    fireEvent.dragStart(tiles[2], { dataTransfer: { effectAllowed: '' } });
    const over = createEvent.dragOver(tiles[0]);
    fireEvent(tiles[0], over);
    expect(over.defaultPrevented).toBe(true);
    fireEvent.drop(tiles[0]);

    expect(ids(onChange.mock.calls[0][0])).toEqual(['c', 'a', 'b']);
  });

  it('offers no controls and no dragging while saving', () => {
    render(<PostMediaStrip isDisabled media={media} onChange={vi.fn()} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute(
      'draggable',
      'false',
    );
  });
});

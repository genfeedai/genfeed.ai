import '@testing-library/jest-dom/vitest';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import PostCardFooter from '@ui/posts/card-footer/PostCardFooter';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

describe('PostCardFooter', () => {
  it('exposes media selection as a named visible action', () => {
    const onSelectMedia = vi.fn();
    render(<PostCardFooter onSelectMedia={onSelectMedia} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add media' }));

    expect(onSelectMedia).toHaveBeenCalledOnce();
  });

  it('lists the attached media with reorder controls when it can change them', () => {
    const onChangeMedia = vi.fn();
    const media = [{ id: 'a' }, { id: 'b' }] as IIngredient[];
    const { rerender } = render(
      <PostCardFooter
        onChangeMedia={onChangeMedia}
        onSelectMedia={vi.fn()}
        selectedMedia={media}
      />,
    );

    expect(screen.getByRole('list', { name: 'Attached media' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Move media 1 later' }));
    expect(onChangeMedia).toHaveBeenCalledOnce();

    rerender(<PostCardFooter onSelectMedia={vi.fn()} selectedMedia={media} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('reports save state as text and offers Save only when dirty', () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <PostCardFooter isDirty={false} onSave={onSave} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(
      screen.queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument();

    rerender(<PostCardFooter isDirty onSave={onSave} />);

    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('offers delete only when allowed', () => {
    const onDelete = vi.fn();
    const { rerender } = render(<PostCardFooter onDelete={onDelete} />);

    expect(
      screen.queryByRole('button', { name: 'Delete post' }),
    ).not.toBeInTheDocument();

    rerender(<PostCardFooter onDelete={onDelete} showDelete />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' }));

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('renders nothing without any action', () => {
    const { container } = render(<PostCardFooter />);

    expect(container).toBeEmptyDOMElement();
  });
});

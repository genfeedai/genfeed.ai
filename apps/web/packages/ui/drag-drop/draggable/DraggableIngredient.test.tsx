import type { IFolder, IIngredient } from '@genfeedai/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import DraggableIngredient from '@ui/drag-drop/draggable/DraggableIngredient';
import { describe, expect, it, vi } from 'vitest';

describe('DraggableIngredient', () => {
  it('writes a normalized ingredient payload when dragging starts from a child element', () => {
    const setData = vi.fn();
    const ingredient = {
      folder: { id: 'folder-123' } as IFolder,
      id: 'ingredient-123',
    } as IIngredient;

    render(
      <DraggableIngredient ingredient={ingredient}>
        <span>Drag me</span>
      </DraggableIngredient>,
    );

    fireEvent.dragStart(screen.getByText('Drag me'), {
      dataTransfer: {
        effectAllowed: 'all',
        setData,
      },
    });

    expect(setData).toHaveBeenCalledWith(
      'application/x-genfeed-ingredient',
      JSON.stringify({
        folder: 'folder-123',
        id: 'ingredient-123',
      }),
    );
    expect(setData).toHaveBeenCalledWith(
      'application/json',
      JSON.stringify({
        folder: 'folder-123',
        id: 'ingredient-123',
      }),
    );
    expect(setData).toHaveBeenCalledWith('ingredientId', 'ingredient-123');
  });
});

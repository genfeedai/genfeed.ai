import { fireEvent, render, screen } from '@testing-library/react';
import DropZoneIngredient from '@ui/drag-drop/zone-ingredient/DropZoneIngredient';
import { describe, expect, it, vi } from 'vitest';

describe('DropZoneIngredient', () => {
  it('uses the normalized drag payload for ingredient-to-ingredient drops', () => {
    const onDrop = vi.fn();

    render(
      <DropZoneIngredient
        ingredient={{ id: 'target-ingredient' } as never}
        onDrop={onDrop}
      >
        <span>Target</span>
      </DropZoneIngredient>,
    );

    fireEvent.drop(screen.getByText('Target'), {
      dataTransfer: {
        getData: (type: string) =>
          type === 'application/x-genfeed-ingredient'
            ? JSON.stringify({
                id: 'source-ingredient',
              })
            : '',
      },
    });

    expect(onDrop).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'source-ingredient',
      }),
      expect.objectContaining({
        id: 'target-ingredient',
      }),
    );
  });
});

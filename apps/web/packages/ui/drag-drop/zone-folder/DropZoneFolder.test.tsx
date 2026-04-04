import { fireEvent, render, screen } from '@testing-library/react';
import DropZoneFolder from '@ui/drag-drop/zone-folder/DropZoneFolder';
import { describe, expect, it, vi } from 'vitest';

describe('DropZoneFolder', () => {
  it('parses the drag payload and passes the dropped ingredient to the folder handler', () => {
    const onDrop = vi.fn();

    render(
      <DropZoneFolder
        folder={{ id: 'folder-456', label: 'Target Folder' }}
        onDrop={onDrop}
      />,
    );

    fireEvent.drop(screen.getByText('Target Folder'), {
      dataTransfer: {
        getData: (type: string) =>
          type === 'application/x-genfeed-ingredient'
            ? JSON.stringify({
                folder: 'folder-123',
                id: 'ingredient-123',
              })
            : '',
      },
    });

    expect(onDrop).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'folder-123',
        id: 'ingredient-123',
      }),
      expect.objectContaining({
        id: 'folder-456',
      }),
    );
  });
});

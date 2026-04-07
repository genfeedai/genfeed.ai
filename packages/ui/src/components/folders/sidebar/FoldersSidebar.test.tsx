import { render, screen } from '@testing-library/react';
import FoldersSidebar from '@ui/folders/sidebar/FoldersSidebar';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/drag-drop/zone-folder/DropZoneFolder', () => ({
  default: ({
    folder,
    isSelected,
  }: {
    folder: unknown;
    isSelected: boolean;
  }) => (
    <div
      data-testid={folder ? 'folder-item' : 'all-folder'}
      data-selected={isSelected}
    >
      {folder ? (folder as { name: string }).name : 'All'}
    </div>
  ),
}));

describe('FoldersSidebar', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <FoldersSidebar folders={[]} onSelectFolder={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render the All folder zone', () => {
    render(<FoldersSidebar folders={[]} onSelectFolder={vi.fn()} />);
    expect(screen.getByTestId('all-folder')).toBeInTheDocument();
  });

  it('should render folder items', () => {
    const folders = [
      { id: '1', name: 'Folder 1' },
      { id: '2', name: 'Folder 2' },
    ];
    render(<FoldersSidebar folders={folders} onSelectFolder={vi.fn()} />);
    expect(screen.getAllByTestId('folder-item')).toHaveLength(2);
  });
});

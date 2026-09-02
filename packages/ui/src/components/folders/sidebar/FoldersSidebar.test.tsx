import type { IFolder } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import FoldersSidebar from '@ui/folders/sidebar/FoldersSidebar';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/drag-drop/zone-folder/DropZoneFolder', () => ({
  default: ({
    className,
    children,
    folder,
    isSelected,
  }: {
    className?: string;
    children?: ReactNode;
    folder: unknown;
    isSelected: boolean;
  }) => (
    <div
      className={className}
      data-testid={folder ? 'folder-item' : 'all-folder'}
      data-selected={isSelected}
    >
      {children ?? (folder ? (folder as { label: string }).label : 'All')}
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
      { id: '1', label: 'Folder 1' },
      { id: '2', label: 'Folder 2' },
    ] as IFolder[];
    render(<FoldersSidebar folders={folders} onSelectFolder={vi.fn()} />);
    expect(screen.getAllByTestId('folder-item')).toHaveLength(2);
  });
});

describe('FoldersSidebar navigation tree', () => {
  const nestedFolders = [
    { id: '1', label: 'Campaigns' },
    { id: '2', label: 'Spring', parentId: '1' },
  ] as IFolder[];

  it('should keep a child folder closed until its parent is expanded', () => {
    render(
      <FoldersSidebar
        folders={nestedFolders}
        onSelectFolder={vi.fn()}
        variant="navigation"
      />,
    );

    expect(screen.getByText('Campaigns')).toBeInTheDocument();
    expect(screen.queryByText('Spring')).not.toBeInTheDocument();
  });

  it('should reveal children when the parent is expanded', () => {
    render(
      <FoldersSidebar
        folders={nestedFolders}
        onSelectFolder={vi.fn()}
        variant="navigation"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand Campaigns' }));

    expect(screen.getByText('Spring')).toBeInTheDocument();
  });

  it('should open the branch holding the selected folder', () => {
    render(
      <FoldersSidebar
        folders={nestedFolders}
        onSelectFolder={vi.fn()}
        selectedFolderId="2"
        variant="navigation"
      />,
    );

    expect(screen.getByText('Spring')).toBeInTheDocument();
  });

  it('should not offer a disclosure for a folder without children', () => {
    render(
      <FoldersSidebar
        folders={[{ id: '1', label: 'Campaigns' }] as IFolder[]}
        onSelectFolder={vi.fn()}
        variant="navigation"
      />,
    );

    expect(
      screen.queryByRole('button', { name: /Expand|Collapse/ }),
    ).not.toBeInTheDocument();
  });

  it('uses the canonical navigation row geometry without a root spacer', () => {
    render(
      <FoldersSidebar
        folders={[{ id: '1', label: 'Campaigns' }] as IFolder[]}
        onSelectFolder={vi.fn()}
        variant="navigation"
      />,
    );

    const allAssetsRow = screen.getByTestId('all-folder');
    const folderRow = screen.getByTestId('folder-item');
    const allAssetsContent = screen.getByText('All assets').parentElement;
    const folderContent = screen.getByText('Campaigns').parentElement;

    expect(allAssetsRow).toHaveClass('h-8', '!px-2.5', '!py-1.5');
    expect(folderRow).toHaveClass('h-8', '!px-2.5', '!py-1.5');
    expect(allAssetsContent).toHaveClass('gap-3');
    expect(folderContent).toHaveClass('gap-3');
    expect(allAssetsContent?.firstElementChild).toHaveClass('size-5');
    expect(folderContent?.firstElementChild).toHaveClass('size-5');
  });
});

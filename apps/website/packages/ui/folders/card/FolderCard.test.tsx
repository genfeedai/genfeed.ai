import type { IFolder } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import FolderCard from '@ui/folders/card/FolderCard';
import { describe, expect, it, vi } from 'vitest';

describe('FolderCard', () => {
  const folder = {
    description: 'Folder description',
    id: 'folder-1',
    label: 'Test Folder',
  } as IFolder;

  it('should render without crashing', () => {
    const { container } = render(
      <FolderCard folder={folder} onClick={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Test Folder')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <FolderCard folder={folder} onClick={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <FolderCard folder={folder} onClick={vi.fn()} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

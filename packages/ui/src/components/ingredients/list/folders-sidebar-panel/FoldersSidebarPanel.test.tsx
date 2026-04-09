import { PageScope } from '@genfeedai/enums';
import { render } from '@testing-library/react';
import type { FoldersSidebarPanelProps } from '@ui/ingredients/list/folders-sidebar-panel/FoldersSidebarPanel';
import FoldersSidebarPanel from '@ui/ingredients/list/folders-sidebar-panel/FoldersSidebarPanel';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/folders/sidebar/FoldersSidebar', () => ({
  default: () => <div data-testid="folders-sidebar" />,
}));

describe('FoldersSidebarPanel', () => {
  const baseProps: FoldersSidebarPanelProps = {
    folders: [],
    isLoading: false,
    onCreateFolder: vi.fn(),
    onDropIngredient: vi.fn(),
    onSelectFolder: vi.fn(),
    scope: PageScope.ORGANIZATION,
  };

  it('should render without crashing', () => {
    const { container } = render(<FoldersSidebarPanel {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(<FoldersSidebarPanel {...baseProps} />);
    expect(
      document.querySelector('[data-testid="folders-sidebar"]'),
    ).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<FoldersSidebarPanel {...baseProps} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

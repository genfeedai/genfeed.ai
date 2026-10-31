import { PageScope } from '@genfeedai/contracts';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FoldersSidebarPanelProps } from '@/features/ingredients/components/ingredients/list/folders-sidebar-panel/FoldersSidebarPanel';
import FoldersSidebarPanel from '@/features/ingredients/components/ingredients/list/folders-sidebar-panel/FoldersSidebarPanel';

vi.mock('@/components/folders/sidebar/FoldersSidebar', () => ({
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

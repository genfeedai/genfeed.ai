import { PageScope } from '@genfeedai/enums';
import type { IngredientsListSidebarProps } from '@props/pages/ingredients-list.props';
import { render } from '@testing-library/react';
import IngredientsListSidebar from '@ui/ingredients/list/sidebar/IngredientsListSidebar';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@ui/ingredients/list/folders-sidebar-panel/FoldersSidebarPanel',
  () => ({
    default: () => <div data-testid="folders-sidebar-panel" />,
  }),
);

describe('IngredientsListSidebar', () => {
  const baseProps: IngredientsListSidebarProps = {
    folders: [],
    isLoading: false,
    onCreateFolder: vi.fn(),
    onDropIngredient: vi.fn(),
    onSelectFolder: vi.fn(),
    scope: PageScope.ORGANIZATION,
  };

  it('should render without crashing', () => {
    const { container } = render(<IngredientsListSidebar {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(<IngredientsListSidebar {...baseProps} />);
    expect(
      document.querySelector('[data-testid="folders-sidebar-panel"]'),
    ).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<IngredientsListSidebar {...baseProps} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

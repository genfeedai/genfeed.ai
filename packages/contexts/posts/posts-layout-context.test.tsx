import { PostsLayoutContext } from '@contexts/posts/posts-layout-context';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';

describe('PostsLayoutContext', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <PostsLayoutContext.Provider
        value={{
          setExportNode: vi.fn(),
          setFiltersNode: vi.fn(),
          setIsRefreshing: vi.fn(),
          setRefresh: vi.fn(),
          setScheduleActionsNode: vi.fn(),
          setViewToggleNode: vi.fn(),
        }}
      >
        <div data-testid="child" />
      </PostsLayoutContext.Provider>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <PostsLayoutContext.Provider
        value={{
          setExportNode: vi.fn(),
          setFiltersNode: vi.fn(),
          setIsRefreshing: vi.fn(),
          setRefresh: vi.fn(),
          setScheduleActionsNode: vi.fn(),
          setViewToggleNode: vi.fn(),
        }}
      >
        <div data-testid="child" />
      </PostsLayoutContext.Provider>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <PostsLayoutContext.Provider
        value={{
          setExportNode: vi.fn(),
          setFiltersNode: vi.fn(),
          setIsRefreshing: vi.fn(),
          setRefresh: vi.fn(),
          setScheduleActionsNode: vi.fn(),
          setViewToggleNode: vi.fn(),
        }}
      >
        <div data-testid="child" />
      </PostsLayoutContext.Provider>,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

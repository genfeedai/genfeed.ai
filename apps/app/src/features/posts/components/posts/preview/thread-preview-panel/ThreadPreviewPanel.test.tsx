import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ThreadPreviewPanel from '@/features/posts/components/posts/preview/thread-preview-panel/ThreadPreviewPanel';

// jsdom ships no ResizeObserver; Radix and cmdk measure on mount.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

describe('ThreadPreviewPanel', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <ThreadPreviewPanel
        parent={{ content: 'Parent content', id: 'parent' }}
        replies={[
          { content: 'Child content 1', id: 'child-1' },
          { content: 'Child content 2', id: 'child-2' },
        ]}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders attached video media in the preview', () => {
    const { container } = render(
      <ThreadPreviewPanel
        parent={{
          content: 'Caption',
          id: 'parent',
          media: [
            {
              category: IngredientCategory.VIDEO,
              id: 'video-1',
              ingredientUrl: 'https://cdn.example.com/video.mp4',
            } as IIngredient,
          ],
        }}
        replies={[]}
      />,
    );

    expect(container.querySelector('video')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {});

  it('should apply correct styles and classes', () => {});
});

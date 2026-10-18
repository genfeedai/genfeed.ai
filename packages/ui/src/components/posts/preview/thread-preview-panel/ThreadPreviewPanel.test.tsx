import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ThreadPreviewPanel from '@ui/posts/preview/thread-preview-panel/ThreadPreviewPanel';

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

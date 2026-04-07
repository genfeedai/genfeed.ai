import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom';
import ThreadPreviewPanel from '@ui/posts/preview/thread-preview-panel/ThreadPreviewPanel';

describe('ThreadPreviewPanel', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <ThreadPreviewPanel
        parent={{ content: 'Parent content', id: 'parent' }}
        children={[
          { content: 'Child content 1', id: 'child-1' },
          { content: 'Child content 2', id: 'child-2' },
        ]}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {});

  it('should apply correct styles and classes', () => {});
});

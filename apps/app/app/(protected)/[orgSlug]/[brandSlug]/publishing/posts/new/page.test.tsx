import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PublishingNewPostPage from './page';

vi.mock('@pages/posts/compose/publishing-post-composer', () => ({
  default: () => <div>new post composer</div>,
}));

describe('PublishingNewPostPage', () => {
  it('renders the compose surface', () => {
    render(<PublishingNewPostPage />);
    expect(screen.getByText('new post composer')).toBeInTheDocument();
  });
});

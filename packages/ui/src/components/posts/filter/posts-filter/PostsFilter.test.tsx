import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import PostsFilter from '@ui/posts/filter/posts-filter/PostsFilter';

describe('PostsFilter', () => {
  it('should render without crashing', () => {
    const { container } = render(<PostsFilter />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

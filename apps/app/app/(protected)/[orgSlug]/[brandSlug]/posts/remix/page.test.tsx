import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PostsRemixPage from './page';

vi.mock('@/features/library-remix/LibraryRemixSurface', () => ({
  default: ({
    sourceArtifact,
    threadId,
  }: {
    sourceArtifact?: string | null;
    threadId?: string | null;
  }) => (
    <div data-testid="library-remix-surface">
      {sourceArtifact ?? 'none'}:{threadId ?? 'none'}
    </div>
  ),
}));

vi.mock('./trend-remix-page', () => ({
  default: () => <div data-testid="trend-remix-surface" />,
}));

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/posts/remix/page.tsx',
);

describe('PostsRemixPage', () => {
  it('launches the focused Library Remix surface with its typed source intent', async () => {
    const page = await PostsRemixPage({
      searchParams: Promise.resolve({
        sourceArtifact: 'ingredient:ingredient-1',
        thread: 'thread-1',
      }),
    });

    render(page);

    expect(screen.getByTestId('library-remix-surface')).toHaveTextContent(
      'ingredient:ingredient-1:thread-1',
    );
    expect(screen.queryByTestId('trend-remix-surface')).not.toBeInTheDocument();
  });

  it('preserves the existing trend Remix route contract', async () => {
    const page = await PostsRemixPage({
      searchParams: Promise.resolve({
        sourceArtifact: 'ingredient:ingredient-1',
        sourceReferenceId: 'trend-1',
      }),
    });

    render(page);

    expect(screen.getByTestId('trend-remix-surface')).toBeInTheDocument();
    expect(
      screen.queryByTestId('library-remix-surface'),
    ).not.toBeInTheDocument();
  });

  it('renders the Library source picker when Remix has no source intent', async () => {
    const page = await PostsRemixPage({});

    render(page);

    expect(screen.getByTestId('library-remix-surface')).toHaveTextContent(
      'none:none',
    );
    expect(screen.queryByTestId('trend-remix-surface')).not.toBeInTheDocument();
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Module from './PostsListToolbar.tsx';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const sortOptions = [{ label: 'Newest First', value: 'createdAt: -1' }];

describe('PostsListToolbar.tsx', () => {
  const source = readFileSync(
    join(import.meta.dirname, 'PostsListToolbar.tsx'),
    'utf8',
  );

  it('exports a component', () => {
    expect(Module).toBeDefined();
  });

  it('resolves publisher view labels through the host pages catalog', () => {
    expect(source).toContain("useTranslations('pages.posts.list')");
    expect(source).toContain("translate('toolbar.sortAria')");
    expect(source).not.toContain('Held as data rather than inline JSX');
    expect(source).not.toContain("label: 'Not posted'");
    expect(source).not.toContain('aria-label="Sort"');
  });

  it('does not accept route navigation as toolbar content', () => {
    expect(source).not.toContain('viewNode');
    expect(source).not.toContain('ReactNode');
  });

  it('offers the Source filter only when a handler is supplied', () => {
    const { rerender } = render(
      <Module
        onSearchChange={vi.fn()}
        onSortChange={vi.fn()}
        searchValue=""
        sortOptions={sortOptions}
        sortValue="createdAt: -1"
      />,
    );
    expect(
      screen.queryByRole('combobox', { name: 'Source' }),
    ).not.toBeInTheDocument();

    rerender(
      <Module
        onSearchChange={vi.fn()}
        onSortChange={vi.fn()}
        onSourceChange={vi.fn()}
        searchValue=""
        sortOptions={sortOptions}
        sortValue="createdAt: -1"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent(
      'All sources',
    );
  });

  it('shows the lowercase extension source as the Extension label', () => {
    render(
      <Module
        onSearchChange={vi.fn()}
        onSortChange={vi.fn()}
        onSourceChange={vi.fn()}
        searchValue=""
        sortOptions={sortOptions}
        sortValue="createdAt: -1"
        sourceValue="extension"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent(
      'Extension',
    );
  });
});

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Module from './PostsListToolbar.tsx';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const sortOptions = [{ label: 'Newest First', value: 'createdAt: -1' }];

async function openFilters() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^Filters/ }));
  return user;
}

describe('PostsListToolbar.tsx', () => {
  it('exports a component', () => {
    expect(Module).toBeDefined();
  });

  it('puts every control behind the one shared Filters menu', async () => {
    render(
      <Module
        onPublishingViewChange={vi.fn()}
        onSortChange={vi.fn()}
        onSourceChange={vi.fn()}
        publishingView="not-posted"
        sortOptions={sortOptions}
        sortValue="createdAt: -1"
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await openFilters();
    expect(
      screen.getByRole('menuitem', { name: /Publishing state/ }),
    ).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /Source/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /Sort/ })).toBeVisible();
  });

  it('offers the Source filter only when a handler is supplied', async () => {
    render(
      <Module
        onSortChange={vi.fn()}
        sortOptions={sortOptions}
        sortValue="createdAt: -1"
      />,
    );
    await openFilters();
    expect(
      screen.queryByRole('menuitem', { name: /Source/ }),
    ).not.toBeInTheDocument();
  });

  it('shows the stored extension source as the Imported label', async () => {
    render(
      <Module
        onSortChange={vi.fn()}
        onSourceChange={vi.fn()}
        sortOptions={sortOptions}
        sortValue="createdAt: -1"
        sourceValue="extension"
      />,
    );
    await openFilters();
    expect(screen.getByRole('menuitem', { name: /Source/ })).toHaveTextContent(
      'Imported',
    );
  });
});

import { selectFilterOption } from '@app-tests/filter-menu.helpers';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import ReviewFilterMenu from './ReviewFilterMenu';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const filterCounts = {
  all: 20,
  approved: 2,
  changes_requested: 0,
  failed: 0,
  pending: 0,
  ready: 18,
  skipped: 0,
};

function renderMenu(
  overrides: Partial<React.ComponentProps<typeof ReviewFilterMenu>> = {},
) {
  const props = {
    activeFilters: ['ready'] as const,
    activeSources: [] as const,
    activeTurboRunId: 'batch-1',
    filterCounts,
    hasTurboControls: true,
    onFilterChange: vi.fn(),
    onSourceChange: vi.fn(),
    onTurboRunChange: vi.fn(),
    turboRunOptions: [
      { label: 'abc123 · 4 items', value: 'batch-1' },
      { label: 'def456 · 2 items', value: 'batch-2' },
    ],
    ...overrides,
  };
  render(<ReviewFilterMenu {...props} />);
  return props;
}

describe('ReviewFilterMenu', () => {
  it('puts source, status and batch behind the one Filters menu', async () => {
    renderMenu();

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('menuitem', { name: /^Source/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /^Status/ })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: /^Batch/ })).toBeVisible();
  });

  it('toggles a status with its count and reports the next selection', async () => {
    const props = renderMenu();

    await selectFilterOption(userEvent.setup(), 'Status', /^Approved/, {
      kind: 'checkbox',
    });

    expect(props.onFilterChange).toHaveBeenCalledWith(['ready', 'approved']);
  });

  it('switches batch from the Batch facet', async () => {
    const props = renderMenu();

    await selectFilterOption(userEvent.setup(), 'Batch', /^def456/);

    expect(props.onTurboRunChange).toHaveBeenCalledWith('batch-2');
  });

  it('keeps only Source when the batch queue is hidden', async () => {
    renderMenu({ hasTurboControls: false });

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('menuitem', { name: /^Source/ })).toBeVisible();
    expect(
      screen.queryByRole('menuitem', { name: /^Status/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /^Batch/ }),
    ).not.toBeInTheDocument();
  });
});

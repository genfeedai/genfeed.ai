import { ViewType } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import CollectionToolbar from '@ui/collection/CollectionToolbar';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    ({
      clearAll: 'Clear all',
      grid: 'Grid',
      list: 'List',
      moreActions: 'More actions',
      removeFilter: `Remove filter ${values?.label}`,
      removeFilterFallback: 'Remove filter',
    })[key] ?? key,
}));

describe('CollectionToolbar', () => {
  it('omits the view toggle when the collection has a single view', () => {
    render(<CollectionToolbar search={<span>search</span>} />);

    expect(
      screen.queryByRole('group', { name: 'View' }),
    ).not.toBeInTheDocument();
  });

  it('switches between list and grid', () => {
    const onViewChange = vi.fn();
    render(
      <CollectionToolbar onViewChange={onViewChange} view={ViewType.LIST} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }));
    expect(onViewChange).toHaveBeenCalledWith(ViewType.GRID);
  });

  it('renders active filters as removable chips with a clear-all', () => {
    const onRemoveType = vi.fn();
    const onClear = vi.fn();
    render(
      <CollectionToolbar
        chips={[
          { id: 'type', label: 'Video', onRemove: onRemoveType },
          { id: 'status', label: 'Draft', onRemove: vi.fn() },
        ]}
        onClearChips={onClear}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove filter Video' }),
    );
    expect(onRemoveType).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('hides clear-all when only one filter is active', () => {
    render(
      <CollectionToolbar
        chips={[{ id: 'type', label: 'Video', onRemove: vi.fn() }]}
        onClearChips={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Clear all' }),
    ).not.toBeInTheDocument();
  });
});

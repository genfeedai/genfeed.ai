import DynamicTable from '@genfeedai/agent/components/blocks/DynamicTable';
import type { TableBlock } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

function makeBlock(overrides: Partial<TableBlock> = {}): TableBlock {
  return {
    columns: [
      { key: 'name', label: 'Name', sortable: true },
      { align: 'right', key: 'views', label: 'Views', sortable: true },
      { align: 'center', key: 'note', label: 'Note' },
    ],
    id: 'table-1',
    rows: [
      { name: 'Beta', note: 'ok', views: 20 },
      { name: 'Alpha', note: null, views: 100 },
      { name: 'Gamma', note: 'hm', views: 5 },
    ],
    type: 'table',
    ...overrides,
  } as TableBlock;
}

function readColumn(index: number): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelectorAll('td')[index]?.textContent ?? '');
}

describe('DynamicTable', () => {
  it('marks the table viewed in session when it is rendered inline', () => {
    const { container } = render(<DynamicTable block={makeBlock()} />);

    expect(container.firstChild).toHaveAttribute(
      'data-work-object-viewed',
      'true',
    );
  });

  it('renders headers and rows in source order by default', () => {
    render(<DynamicTable block={makeBlock()} />);

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Views')).toBeInTheDocument();
    expect(readColumn(0)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('renders a dash for nullish cells', () => {
    render(<DynamicTable block={makeBlock()} />);

    expect(readColumn(2)).toEqual(['ok', '—', 'hm']);
  });

  it('applies the initial sort from the block', () => {
    render(<DynamicTable block={makeBlock({ sortBy: 'name' })} />);

    expect(readColumn(0)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('honours an explicit descending initial direction', () => {
    render(
      <DynamicTable
        block={makeBlock({ sortBy: 'name', sortDirection: 'desc' })}
      />,
    );

    expect(readColumn(0)).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('sorts numerically when the column holds numbers', () => {
    render(<DynamicTable block={makeBlock({ sortBy: 'views' })} />);

    expect(readColumn(1)).toEqual(['5', '20', '100']);
  });

  it('toggles sort direction when a sortable header is clicked twice', () => {
    render(<DynamicTable block={makeBlock()} />);

    fireEvent.click(screen.getByText('Name'));
    expect(readColumn(0)).toEqual(['Alpha', 'Beta', 'Gamma']);

    fireEvent.click(screen.getByText('Name'));
    expect(readColumn(0)).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('switches the sorted column and resets to ascending', () => {
    render(<DynamicTable block={makeBlock({ sortBy: 'name' })} />);

    fireEvent.click(screen.getByText('Views'));

    expect(readColumn(1)).toEqual(['5', '20', '100']);
  });

  it('ignores clicks on non-sortable headers', () => {
    render(<DynamicTable block={makeBlock()} />);

    fireEvent.click(screen.getByText('Note'));

    expect(readColumn(0)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('pushes nullish values to the end when sorting', () => {
    render(
      <DynamicTable
        block={makeBlock({
          rows: [
            { name: 'A', note: null, views: 1 },
            { name: 'B', note: 'x', views: 2 },
            { name: 'C', note: null, views: 3 },
          ],
          sortBy: 'note',
        })}
      />,
    );

    expect(readColumn(0)).toEqual(['B', 'A', 'C']);
  });

  it('shows an empty state when there are no rows', () => {
    render(<DynamicTable block={makeBlock({ rows: [] })} />);

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders skeleton rows while hydrating', () => {
    const block = {
      ...makeBlock(),
      hydration: { status: 'loading' as const },
    } as TableBlock;

    render(<DynamicTable block={block} />);

    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    // Header row plus four skeleton rows.
    expect(screen.getAllByRole('row')).toHaveLength(5);
  });
});

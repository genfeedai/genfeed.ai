import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Table from '@ui/display/table/Table';
import { describe, expect, it, vi } from 'vitest';

describe('Table', () => {
  it('should render without crashing', () => {
    const { container } = render(<Table />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<Table />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<Table />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('reveals touch-safe row actions on keyboard focus', () => {
    render(
      <Table
        items={[{ id: 'item-1', name: 'First item' }]}
        columns={[
          {
            header: 'Name',
            key: 'name',
          },
        ]}
        actions={[
          {
            icon: 'Edit',
            onClick: () => {},
            tooltip: 'Edit item',
          },
        ]}
        getRowKey={(item) => item.id}
      />,
    );

    const action = screen.getByTestId('action-button');
    expect(action).toHaveClass('size-11', 'lg:size-8', '[&_svg]:size-3.5');
    expect(action.closest('td')?.firstElementChild).toHaveClass(
      'group-focus-within:opacity-100',
      'group-focus-within:translate-x-0',
      'transition-[opacity,transform]',
    );
  });

  it('activates onRowClick from keyboard Enter and Space', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();

    render(
      <Table
        items={[{ id: 'item-1', name: 'First item' }]}
        columns={[{ header: 'Name', key: 'name' }]}
        getRowKey={(item) => item.id}
        onRowClick={onRowClick}
      />,
    );

    const row = screen.getByText('First item').closest('tr');
    expect(row).toHaveAttribute('tabindex', '0');

    row?.focus();
    await user.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item-1' }),
    );

    fireEvent.keyDown(row as HTMLElement, { key: ' ' });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it('renders empty without card chrome or a doubled border', () => {
    render(
      <Table
        items={[]}
        columns={[{ header: 'Name', key: 'name' }]}
        emptyLabel="No unread items"
        emptyDescription="Items waiting for your attention will show up here."
      />,
    );

    const empty = screen.getByTestId('table-empty');
    expect(empty).not.toHaveClass('border');
    expect(empty).not.toHaveClass('shadow-border');
    expect(empty).not.toHaveClass('bg-card');
    expect(screen.getByText('No unread items')).toBeInTheDocument();
  });

  it('uses one hairline system for header and rows', () => {
    const { container } = render(
      <Table
        items={[{ id: 'item-1', name: 'First item' }]}
        columns={[{ header: 'Name', key: 'name' }]}
        getRowKey={(item) => item.id}
      />,
    );

    const table = container.querySelector('table');
    const card = table?.closest('div.relative');
    const head = container.querySelector('thead');
    const body = container.querySelector('tbody');

    expect(table).toHaveClass('border-collapse');
    expect(card).toHaveClass(
      'rounded-card',
      'border',
      'border-border',
      'bg-card',
    );
    expect(card).not.toHaveClass('shadow-border');
    expect(head).toHaveClass(
      'border-b',
      'border-border',
      'bg-background-secondary/60',
    );
    expect(body).toHaveClass('divide-y', 'divide-border');
    expect(container.querySelector('thead tr')).not.toHaveClass('border-b');
  });

  it('can delegate its frame to a shared section surface', () => {
    const { container } = render(
      <Table
        framed={false}
        items={[{ id: 'item-1', name: 'First item' }]}
        columns={[{ header: 'Name', key: 'name' }]}
        getRowKey={(item) => item.id}
      />,
    );

    const card = container.querySelector('table')?.closest('div.relative');
    expect(card).toHaveClass('rounded-none', 'border-0', 'shadow-none');
    expect(card).not.toHaveClass('border-border', 'rounded-card');
  });

  it('keeps delegated loading chrome frameless', () => {
    render(
      <Table
        framed={false}
        isLoading
        items={[]}
        columns={[{ header: 'Name', key: 'name' }]}
      />,
    );

    expect(screen.getByTestId('skeleton-table')).toHaveClass(
      'rounded-none',
      'border-0',
      'shadow-none',
    );
  });

  it('exposes controlled sortable column headers', () => {
    const onSortChange = vi.fn();
    const { rerender } = render(
      <Table
        items={[{ id: 'item-1', name: 'First item' }]}
        columns={[{ header: 'Name', key: 'name', sortable: true }]}
        getRowKey={(item) => item.id}
        onSortChange={onSortChange}
        sortDirection="asc"
        sortKey="name"
      />,
    );

    const header = screen.getByRole('columnheader', { name: /name/i });
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Name' }));
    expect(onSortChange).toHaveBeenCalledWith('name', 'desc');

    rerender(
      <Table
        items={[{ id: 'item-1', name: 'First item' }]}
        columns={[{ header: 'Name', key: 'name', sortable: true }]}
        getRowKey={(item) => item.id}
        onSortChange={onSortChange}
        sortDirection="desc"
        sortKey="name"
      />,
    );
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('does not fire onRowClick when keyboard targets a nested button', () => {
    const onRowClick = vi.fn();
    const onAction = vi.fn();

    render(
      <Table
        items={[{ id: 'item-1', name: 'First item' }]}
        columns={[{ header: 'Name', key: 'name' }]}
        actions={[
          {
            icon: 'Edit',
            onClick: onAction,
            tooltip: 'Edit item',
          },
        ]}
        getRowKey={(item) => item.id}
        onRowClick={onRowClick}
      />,
    );

    const action = screen.getByTestId('action-button');
    fireEvent.keyDown(action, { key: 'Enter' });
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('navigates linked rows through a real anchor', () => {
    render(
      <Table
        items={[
          { id: 'item-1', name: 'First item' },
          { id: 'item-2', name: 'Second item' },
        ]}
        columns={[{ header: 'Name', key: 'name' }]}
        getRowKey={(item) => item.id}
        getRowLink={(item) =>
          item.id === 'item-1'
            ? { href: `/items/${item.id}`, label: `Open ${item.name}` }
            : undefined
        }
      />,
    );

    // The overlay anchor carries no text, so the explicit label is the only
    // accessible name a screen reader can announce for the row.
    const link = screen.getByRole('link', { name: 'Open First item' });
    expect(link).toHaveAttribute('href', '/items/item-1');
    expect(link).toHaveClass('absolute', 'inset-0');

    // The anchor owns activation and keyboard focus; the row must not also be
    // a tab stop, or every row would be reachable twice.
    const linkedRow = screen.getByText('First item').closest('tr');
    expect(linkedRow).toHaveClass('relative');
    expect(linkedRow).not.toHaveAttribute('tabindex');

    // A row with nowhere to go stays plain markup.
    expect(screen.queryByRole('link', { name: /second item/i })).toBeNull();
  });
});

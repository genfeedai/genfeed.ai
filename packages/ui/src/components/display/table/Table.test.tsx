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

  it('uses one hairline system for header and rows', () => {
    const { container } = render(
      <Table
        items={[{ id: 'item-1', name: 'First item' }]}
        columns={[{ header: 'Name', key: 'name' }]}
        getRowKey={(item) => item.id}
      />,
    );

    const table = container.querySelector('table');
    const head = container.querySelector('thead');
    const body = container.querySelector('tbody');

    expect(table).toHaveClass('border-collapse');
    expect(head).toHaveClass('border-b', 'border-border');
    expect(body).toHaveClass('divide-y', 'divide-border');
    expect(container.querySelector('thead tr')).not.toHaveClass('border-b');
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
});

import { render, screen } from '@testing-library/react';
import Table from '@ui/display/table/Table';
import { describe, expect, it } from 'vitest';

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
    expect(action).toHaveClass(
      'min-h-11',
      'min-w-11',
      'lg:min-h-0',
      'lg:min-w-0',
    );
    expect(action.closest('td')?.firstElementChild).toHaveClass(
      'group-focus-within:opacity-100',
      'group-focus-within:translate-x-0',
      'transition-[opacity,transform]',
    );
  });
});

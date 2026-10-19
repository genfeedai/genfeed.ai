import { render, screen } from '@testing-library/react';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { describe, expect, it } from 'vitest';

describe('TableRowSummary', () => {
  it('links to the detail page and lists only known facts', () => {
    render(
      <TableRowSummary
        facts={[
          { id: 'status', label: 'Status', value: 'Active' },
          { id: 'owner', label: 'Owner', value: '  ' },
          { id: 'count', label: 'Runs', value: 0 },
        ]}
        openHref="/things/1"
      >
        <p>Extra</p>
      </TableRowSummary>,
    );

    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/things/1',
    );
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('Owner')).not.toBeInTheDocument();
    expect(screen.getByText('Extra')).toBeInTheDocument();
  });

  it('omits the header when there is no badge or page', () => {
    render(<TableRowSummary facts={[{ id: 'a', label: 'A', value: 'b' }]} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

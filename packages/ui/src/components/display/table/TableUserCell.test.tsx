import { render, screen } from '@testing-library/react';
import TableUserCell from '@ui/display/table/TableUserCell';
import { describe, expect, it } from 'vitest';

describe('TableUserCell', () => {
  it('shows the email muted under the name', () => {
    render(<TableUserCell email="ada@example.com" name="Ada Lovelace" />);

    expect(screen.getByText('Ada Lovelace')).toBeVisible();
    expect(screen.getByText('ada@example.com')).toHaveClass(
      'text-muted-foreground',
    );
  });

  it('shows the email alone, once, when it is the only name there is', () => {
    render(<TableUserCell email="poya@vitae.ai" name="poya@vitae.ai" />);

    expect(screen.getAllByText('poya@vitae.ai')).toHaveLength(1);
  });

  it('leads with the email when the user has no name', () => {
    render(<TableUserCell email="ada@example.com" />);

    expect(screen.getByText('ada@example.com')).toBeVisible();
  });

  it('links to the user when given a destination', () => {
    render(
      <TableUserCell
        email="ada@example.com"
        href="/admin/users/user-1"
        linkLabel="Open user Ada Lovelace"
        name="Ada Lovelace"
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Open user Ada Lovelace' }),
    ).toHaveAttribute('href', '/admin/users/user-1');
  });

  it('reads as empty with neither name nor email', () => {
    render(<TableUserCell emptyLabel="No owner" />);

    expect(screen.getByText('No owner')).toBeVisible();
  });
});

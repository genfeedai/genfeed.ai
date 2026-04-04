import { render, screen } from '@testing-library/react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { describe, expect, it, vi } from 'vitest';

describe('Table', () => {
  const renderBasicTable = () =>
    render(
      <Table>
        <TableCaption>User list</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Alice</TableCell>
            <TableCell>alice@example.com</TableCell>
            <TableCell>Admin</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Bob</TableCell>
            <TableCell>bob@example.com</TableCell>
            <TableCell>User</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>Total: 2 users</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );

  describe('Table Root', () => {
    it('renders without crashing', () => {
      renderBasicTable();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('renders table element', () => {
      renderBasicTable();
      expect(document.querySelector('table')).toBeInTheDocument();
    });

    it('is wrapped in overflow container', () => {
      const { container } = renderBasicTable();
      const wrapper = container.querySelector('.overflow-auto');
      expect(wrapper).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Table className="custom-table">
          <TableBody>
            <TableRow>
              <TableCell>Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>,
      );
      expect(document.querySelector('table')).toHaveClass('custom-table');
    });

    it('has default table styles', () => {
      renderBasicTable();
      const table = document.querySelector('table');
      expect(table).toHaveClass('w-full');
      expect(table).toHaveClass('caption-bottom');
      expect(table).toHaveClass('text-sm');
    });
  });

  describe('TableHeader', () => {
    it('renders thead element', () => {
      renderBasicTable();
      expect(document.querySelector('thead')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Table>
          <TableHeader className="custom-header">
            <TableRow>
              <TableHead>Col</TableHead>
            </TableRow>
          </TableHeader>
        </Table>,
      );
      expect(document.querySelector('thead')).toHaveClass('custom-header');
    });

    it('has border on rows', () => {
      renderBasicTable();
      const thead = document.querySelector('thead');
      expect(thead).toHaveClass('[&_tr]:border-b');
    });
  });

  describe('TableBody', () => {
    it('renders tbody element', () => {
      renderBasicTable();
      expect(document.querySelector('tbody')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Table>
          <TableBody className="custom-body">
            <TableRow>
              <TableCell>Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>,
      );
      expect(document.querySelector('tbody')).toHaveClass('custom-body');
    });
  });

  describe('TableFooter', () => {
    it('renders tfoot element', () => {
      renderBasicTable();
      expect(document.querySelector('tfoot')).toBeInTheDocument();
    });

    it('renders footer content', () => {
      renderBasicTable();
      expect(screen.getByText('Total: 2 users')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Table>
          <TableFooter className="custom-footer">
            <TableRow>
              <TableCell>Footer</TableCell>
            </TableRow>
          </TableFooter>
        </Table>,
      );
      expect(document.querySelector('tfoot')).toHaveClass('custom-footer');
    });

    it('has bg-muted/50', () => {
      renderBasicTable();
      expect(document.querySelector('tfoot')).toHaveClass('bg-muted/50');
    });
  });

  describe('TableRow', () => {
    it('renders tr elements', () => {
      renderBasicTable();
      const rows = screen.getAllByRole('row');
      expect(rows.length).toBeGreaterThan(0);
    });

    it('applies custom className', () => {
      render(
        <Table>
          <TableBody>
            <TableRow className="custom-row">
              <TableCell>Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>,
      );
      const rows = screen.getAllByRole('row');
      expect(rows[0]).toHaveClass('custom-row');
    });

    it('has transition styles', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>,
      );
      expect(screen.getByRole('row')).toHaveClass('transition-colors');
    });
  });

  describe('TableHead', () => {
    it('renders th elements', () => {
      renderBasicTable();
      const headers = screen.getAllByRole('columnheader');
      expect(headers).toHaveLength(3);
    });

    it('renders column header text', () => {
      renderBasicTable();
      expect(
        screen.getByRole('columnheader', { name: 'Name' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('columnheader', { name: 'Email' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('columnheader', { name: 'Role' }),
      ).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="custom-head">Header</TableHead>
            </TableRow>
          </TableHeader>
        </Table>,
      );
      expect(screen.getByRole('columnheader')).toHaveClass('custom-head');
    });

    it('has correct default styles', () => {
      renderBasicTable();
      const th = screen.getByRole('columnheader', { name: 'Name' });
      expect(th).toHaveClass('h-10');
      expect(th).toHaveClass('text-left');
    });
  });

  describe('TableCell', () => {
    it('renders td elements with data', () => {
      renderBasicTable();
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="custom-cell">Cell Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>,
      );
      expect(screen.getByText('Cell Content')).toHaveClass('custom-cell');
    });

    it('supports colSpan', () => {
      renderBasicTable();
      const footerCell = screen.getByText('Total: 2 users');
      expect(footerCell).toHaveAttribute('colSpan', '3');
    });

    it('has correct default styles', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>,
      );
      const cell = screen.getByText('Cell');
      expect(cell).toHaveClass('p-2');
    });
  });

  describe('TableCaption', () => {
    it('renders caption', () => {
      renderBasicTable();
      expect(screen.getByText('User list')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Table>
          <TableCaption className="custom-caption">Caption</TableCaption>
        </Table>,
      );
      expect(screen.getByText('Caption')).toHaveClass('custom-caption');
    });

    it('has caption-side styling', () => {
      render(
        <Table>
          <TableCaption>Table Caption</TableCaption>
        </Table>,
      );
      const caption = screen.getByText('Table Caption');
      expect(caption).toHaveClass('text-sm');
      expect(caption).toHaveClass('text-muted-foreground');
    });
  });

  describe('accessibility', () => {
    it('has table role', () => {
      renderBasicTable();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('has columnheader roles for thead cells', () => {
      renderBasicTable();
      expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    });

    it('has rowheader or cell roles for tbody cells', () => {
      renderBasicTable();
      expect(screen.getAllByRole('cell').length).toBeGreaterThan(0);
    });

    it('has row roles', () => {
      renderBasicTable();
      expect(screen.getAllByRole('row').length).toBeGreaterThan(0);
    });

    it('caption provides accessible name', () => {
      renderBasicTable();
      const caption = screen.getByText('User list');
      expect(caption).toBeInTheDocument();
    });
  });

  describe('ref forwarding', () => {
    it('Table forwards ref', () => {
      const ref = vi.fn();
      render(
        <Table ref={ref}>
          <TableBody>
            <TableRow>
              <TableCell>Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>,
      );
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLTableElement);
    });

    it('TableRow forwards ref', () => {
      const ref = vi.fn();
      render(
        <Table>
          <TableBody>
            <TableRow ref={ref}>
              <TableCell>Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>,
      );
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLTableRowElement);
    });

    it('TableCell forwards ref', () => {
      const ref = vi.fn();
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell ref={ref}>Cell</TableCell>
            </TableRow>
          </TableBody>
        </Table>,
      );
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLTableCellElement);
    });
  });

  describe('empty state', () => {
    it('renders empty table', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody />
        </Table>,
      );
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.queryAllByRole('cell')).toHaveLength(0);
    });
  });

  describe('data rendering', () => {
    it('renders all rows', () => {
      renderBasicTable();
      // header row + 2 data rows + footer row
      expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(3);
    });

    it('renders all columns', () => {
      renderBasicTable();
      expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    });

    it('renders correct cell data', () => {
      renderBasicTable();
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    });
  });
});

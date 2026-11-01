import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { describe, expect, it } from 'vitest';

function renderTable(props: Parameters<typeof Table>[0] = {}) {
  render(
    <Table {...props}>
      <TableHeader>
        <TableRow>
          <TableHead align="center" tone="highlight">
            Plan
          </TableHead>
          <TableHead isSortable>Price</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableHead scope="row" variant="row">
            Credits
          </TableHead>
          <TableCell align="right" tone="muted">
            60k
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe('Table variants', () => {
  it('keeps the dense layout by default', () => {
    renderTable();

    expect(screen.getByRole('table')).not.toHaveClass('[&_td]:px-4');
  });

  it('gives the roomy size and zebra rows to the table, not to each cell', () => {
    renderTable({ isStriped: true, size: 'md' });

    expect(screen.getByRole('table')).toHaveClass(
      '[&_td]:px-4',
      '[&_tbody_tr:nth-child(odd)]:bg-card/50',
    );
  });

  it('aligns and tones header and body cells', () => {
    renderTable();

    expect(screen.getByRole('columnheader', { name: 'Plan' })).toHaveClass(
      'text-center',
      'bg-primary/10',
    );
    expect(screen.getByRole('cell', { name: '60k' })).toHaveClass(
      'text-right',
      'text-foreground/70',
    );
  });

  it('reads a row header as text and marks a sortable column', () => {
    renderTable();

    expect(screen.getByRole('rowheader', { name: 'Credits' })).toHaveClass(
      'normal-case',
      'text-foreground',
    );
    expect(screen.getByRole('columnheader', { name: 'Price' })).toHaveClass(
      'cursor-pointer',
    );
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import Table from '@ui/display/table/Table';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ prefetch: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

interface Row {
  id: string;
  name: string;
}

function buildRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index + 1}`,
    name: `Item ${index + 1}`,
  }));
}

function renderLinkedTable(rows: Row[]) {
  return render(
    <Table
      columns={[{ header: 'Name', key: 'name' }]}
      getRowKey={(item) => item.id}
      getRowLink={(item) => ({
        href: `/items/${item.id}`,
        label: `Open ${item.name}`,
      })}
      items={rows}
    />,
  );
}

describe('Table row link prefetch', () => {
  beforeEach(() => {
    router.prefetch.mockClear();
  });

  it('prepares a row page when the row is pointed at in a list of more than 20 links', () => {
    renderLinkedTable(buildRows(21));

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Open Item 7' }));

    expect(router.prefetch.mock.calls).toEqual([['/items/item-7']]);
  });

  it('prepares a row page when its link receives focus in a long list', () => {
    renderLinkedTable(buildRows(21));

    fireEvent.focus(screen.getByRole('link', { name: 'Open Item 3' }));

    expect(router.prefetch.mock.calls).toEqual([['/items/item-3']]);
  });

  it('leaves a short list to the link, which prepares on view', () => {
    renderLinkedTable(buildRows(20));

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Open Item 7' }));

    expect(router.prefetch).not.toHaveBeenCalled();
  });
});

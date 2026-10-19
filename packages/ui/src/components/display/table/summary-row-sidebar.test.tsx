import { fireEvent, render, screen } from '@testing-library/react';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

interface Thing {
  id: string;
  label: string;
  note?: string;
}

const thing: Thing = { id: 't1', label: 'Thing', note: 'hello' };

describe('createSummaryRowSidebar', () => {
  it('maps the record to the sidebar identity', () => {
    const sidebar = createSummaryRowSidebar<Thing>({
      getId: (item) => item.id,
      getSubtitle: (item) => item.note,
      getTitle: (item) => item.label,
      kind: 'record',
    });

    expect(sidebar.getId(thing)).toBe('t1');
    expect(sidebar.getTitle(thing)).toBe('Thing');
    expect(sidebar.getSubtitle?.(thing)).toBe('hello');
    expect(sidebar.kind).toBe('record');
  });

  it('renders facts and an Edit button that edits the record', () => {
    const onEdit = vi.fn();
    const sidebar = createSummaryRowSidebar<Thing>({
      getFacts: (item) => [{ id: 'note', label: 'Note', value: item.note }],
      getId: (item) => item.id,
      getTitle: (item) => item.label,
      kind: 'record',
      onEdit,
    });

    render(sidebar.render(thing));

    expect(screen.getByText('Note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(thing);
  });

  it('hides Edit for records the viewer cannot edit', () => {
    const sidebar = createSummaryRowSidebar<Thing>({
      canEdit: (item) => item.id !== 't1',
      getId: (item) => item.id,
      getTitle: (item) => item.label,
      kind: 'record',
      onEdit: vi.fn(),
    });

    render(sidebar.render(thing));

    expect(
      screen.queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument();
  });

  it('omits Edit and the Open link when not configured', () => {
    const sidebar = createSummaryRowSidebar<Thing>({
      getId: (item) => item.id,
      getTitle: (item) => item.label,
      kind: 'record',
    });

    render(sidebar.render(thing));

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('links to the detail page when one exists', () => {
    const sidebar = createSummaryRowSidebar<Thing>({
      getId: (item) => item.id,
      getOpenHref: (item) => `/things/${item.id}`,
      getTitle: (item) => item.label,
      kind: 'record',
    });

    render(sidebar.render(thing));

    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/things/t1',
    );
  });
});

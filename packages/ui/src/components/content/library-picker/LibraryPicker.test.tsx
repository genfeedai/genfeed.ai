import '@testing-library/jest-dom/vitest';
import type { LibraryGridItem } from '@genfeedai/props/ui/content/library-picker.props';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LibraryGrid from './LibraryGrid';
import LibraryPicker from './LibraryPicker';

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

const ITEMS: readonly LibraryGridItem[] = [
  {
    id: 'a',
    kind: 'image',
    thumbnailUrl: 'https://cdn.test/a.png',
    title: 'Sunset',
  },
  { id: 'b', kind: 'video', title: 'Waves' },
  { id: 'c', kind: 'text', title: 'Launch thread' },
];

describe('LibraryGrid', () => {
  it('lists every item as an option and reports the clicked one', () => {
    const onSelect = vi.fn();
    render(
      <LibraryGrid ariaLabel="Library" items={ITEMS} onSelect={onSelect} />,
    );

    const list = screen.getByRole('listbox', { name: 'Library' });
    expect(within(list).getAllByRole('option')).toHaveLength(3);

    fireEvent.click(within(list).getByRole('option', { name: 'Waves' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(ITEMS[1]);
  });

  it('marks selected tiles, and a locked selection ignores a second click', () => {
    const onSelect = vi.fn();
    render(
      <LibraryGrid
        ariaLabel="Library"
        isSelectedLocked
        items={ITEMS}
        onSelect={onSelect}
        selectedIds={new Set(['a'])}
      />,
    );

    const selected = screen.getByRole('option', { name: 'Sunset' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Waves' })).toHaveAttribute(
      'aria-selected',
      'false',
    );

    fireEvent.click(selected);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps a selected tile clickable when the picker toggles', () => {
    const onSelect = vi.fn();
    render(
      <LibraryGrid
        ariaLabel="Library"
        items={ITEMS}
        onSelect={onSelect}
        selectedIds={new Set(['a'])}
      />,
    );

    fireEvent.click(screen.getByRole('option', { name: 'Sunset' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(ITEMS[0]);
  });

  it('names a tile with getItemAriaLabel and draws a preview slot over the thumbnail', () => {
    render(
      <LibraryGrid
        ariaLabel="Library"
        getItemAriaLabel={(item) => `Reference ${item.title}`}
        items={ITEMS}
        onSelect={vi.fn()}
        renderPreview={(item) =>
          item.id === 'b' ? <div data-testid="custom-preview" /> : null
        }
      />,
    );

    expect(
      screen.getByRole('option', { name: 'Reference Waves' }),
    ).toContainElement(screen.getByTestId('custom-preview'));
    expect(
      screen
        .getByRole('option', { name: 'Reference Sunset' })
        .querySelector('img'),
    ).toHaveAttribute('src', 'https://cdn.test/a.png');
  });
});

describe('LibraryPicker', () => {
  const props = {
    description: 'Pick one',
    emptyLabel: 'Nothing here',
    gridLabel: 'Library content',
    isOpen: true,
    items: ITEMS,
    onOpenChange: vi.fn(),
    onQueryChange: vi.fn(),
    onSelect: vi.fn(),
    query: '',
    searchLabel: 'Search library',
    searchPlaceholder: 'Search…',
    title: 'Your Library',
  };

  it('renders the search, the filters slot, the top section and the grid', () => {
    render(
      <LibraryPicker
        {...props}
        filters={<button type="button">Filters</button>}
        footer={<p>Footer note</p>}
        topSection={<section aria-label="Knowledge">Auto</section>}
      />,
    );

    expect(
      screen.getByRole('dialog', { name: 'Your Library' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Search library' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Knowledge' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Footer note')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('reports each keystroke of the search', () => {
    const onQueryChange = vi.fn();
    render(<LibraryPicker {...props} onQueryChange={onQueryChange} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search library' }), {
      target: { value: 'sun' },
    });
    expect(onQueryChange).toHaveBeenCalledWith('sun');
  });

  it('shows the empty label, and a spinner instead of the grid while loading', () => {
    const view = render(<LibraryPicker {...props} items={[]} />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    view.rerender(<LibraryPicker {...props} isLoading />);
    expect(
      screen.getByRole('status', { name: 'Loading library' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

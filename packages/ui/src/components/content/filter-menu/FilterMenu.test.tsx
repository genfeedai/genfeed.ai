import '@testing-library/jest-dom/vitest';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import { describe, expect, it, vi } from 'vitest';

const OPTIONS = [
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
];

function renderMenu(facets: FilterMenuFacet[], onClear = vi.fn()) {
  render(
    <FilterMenu
      clearLabel="Clear filters"
      facets={facets}
      getActiveCountLabel={(count) => `${count} active`}
      label="Filters"
      onClear={onClear}
    />,
  );
  return onClear;
}

async function openFacet(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  await user.click(screen.getByRole('button', { name: /^Filters/ }));
  screen.getByRole('menuitem', { name }).focus();
  await user.keyboard('{ArrowRight}');
}

describe('FilterMenu', () => {
  it('adds and removes values of a multiple facet and keeps the menu open', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderMenu([
      {
        key: 'category',
        label: 'Category',
        onChange,
        options: OPTIONS,
        selection: 'multiple',
        values: ['image'],
      },
    ]);
    await openFacet(user, /Category/);
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Video' }),
    );
    expect(onChange).toHaveBeenLastCalledWith(['image', 'video']);
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Image' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Video' }),
    ).toBeVisible();
  });

  it('reports the chosen value of a single facet', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderMenu([
      {
        defaultValue: 'image',
        key: 'sort',
        label: 'Sort',
        onChange,
        options: OPTIONS,
        selection: 'single',
        value: 'image',
      },
    ]);
    await openFacet(user, /Sort/);
    await user.click(
      await screen.findByRole('menuitemradio', { name: 'Video' }),
    );
    expect(onChange).toHaveBeenCalledWith('video');
  });

  it('counts only non-default selections and clears them', async () => {
    const user = userEvent.setup();
    const onClear = renderMenu([
      {
        key: 'category',
        label: 'Category',
        onChange: vi.fn(),
        options: OPTIONS,
        selection: 'multiple',
        values: ['image', 'video'],
      },
      {
        defaultValue: 'image',
        key: 'sort',
        label: 'Sort',
        onChange: vi.fn(),
        options: OPTIONS,
        selection: 'single',
        value: 'image',
      },
    ]);
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveTextContent(
      'Filters22 active',
    );
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('hides clear when nothing is selected', async () => {
    const user = userEvent.setup();
    renderMenu([
      {
        key: 'category',
        label: 'Category',
        onChange: vi.fn(),
        options: OPTIONS,
        selection: 'multiple',
        values: [],
      },
    ]);
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(
      screen.queryByRole('menuitem', { name: 'Clear filters' }),
    ).not.toBeInTheDocument();
  });

  it('disables unselected options at the selection limit', async () => {
    const user = userEvent.setup();
    renderMenu([
      {
        key: 'tags',
        label: 'Tags',
        maxSelected: 1,
        maxSelectedMessage: 'Up to 1 tag',
        onChange: vi.fn(),
        options: OPTIONS,
        selection: 'multiple',
        values: ['image'],
      },
    ]);
    await openFacet(user, /Tags/);
    expect(
      await screen.findByRole('menuitemcheckbox', { name: 'Video' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Up to 1 tag')).toBeVisible();
  });

  it('searches long lists without dropping selected options', async () => {
    const user = userEvent.setup();
    const options = Array.from({ length: 10 }, (_, index) => ({
      label: `Tag ${index}`,
      value: `tag-${index}`,
    }));
    renderMenu([
      {
        key: 'tags',
        label: 'Tags',
        onChange: vi.fn(),
        options,
        searchPlaceholder: 'Search tags',
        selection: 'multiple',
        values: ['tag-9'],
      },
    ]);
    await openFacet(user, /Tags/);
    await user.type(await screen.findByLabelText('Search tags'), 'Tag 2');
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Tag 2' }),
    ).toBeVisible();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Tag 9' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'Tag 3' }),
    ).not.toBeInTheDocument();
  });
});

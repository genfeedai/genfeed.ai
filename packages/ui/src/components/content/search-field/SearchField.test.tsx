import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchField from '@ui/content/search-field/SearchField';
import { describe, expect, it, vi } from 'vitest';

describe('SearchField', () => {
  it('is a persistent field, not a collapsed icon', () => {
    render(<SearchField placeholder="Search posts" />);

    expect(screen.getByPlaceholderText('Search posts')).toBeVisible();
  });

  it('reports the search on Enter', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<SearchField onSearch={onSearch} placeholder="Search posts" />);

    await user.type(
      screen.getByPlaceholderText('Search posts'),
      'launch{Enter}',
    );

    expect(onSearch).toHaveBeenCalledExactlyOnceWith('launch');
  });

  it('holds the trailing control inside the same field as the input', () => {
    render(
      <SearchField placeholder="Search posts">
        <button type="button">Filters</button>
      </SearchField>,
    );

    const field =
      screen.getByPlaceholderText('Search posts').parentElement?.parentElement;
    expect(field).toContainElement(
      screen.getByRole('button', { name: 'Filters' }),
    );
  });

  it('keeps the clear button reachable, beside a trailing Filters control when there is one', () => {
    const { rerender } = render(
      <SearchField placeholder="Search posts" value="launch" />,
    );
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeVisible();

    rerender(
      <SearchField placeholder="Search posts" value="launch">
        <button type="button">Filters</button>
      </SearchField>,
    );
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeVisible();
  });
});

import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SearchField from '@/components/content/search-field/SearchField';

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

  it('reserves the rendered width of the trailing control and follows its changes', () => {
    let measuredWidth = 96;
    let notifyResize: () => void = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notifyResize = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return {
          width: this.contains(
            screen.queryByRole('button', { name: 'Filters' }),
          )
            ? measuredWidth
            : 0,
        } as DOMRect;
      },
    );

    render(
      <SearchField placeholder="Search posts" value="launch">
        <button type="button">Filters</button>
      </SearchField>,
    );
    const field =
      screen.getByPlaceholderText('Search posts').parentElement?.parentElement;
    expect(field?.style.getPropertyValue('--search-trailing-width')).toBe(
      '96px',
    );

    measuredWidth = 148;
    act(() => notifyResize());
    expect(field?.style.getPropertyValue('--search-trailing-width')).toBe(
      '148px',
    );

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('adds no reserved space without a trailing control', () => {
    render(<SearchField placeholder="Search posts" value="launch" />);

    const field =
      screen.getByPlaceholderText('Search posts').parentElement?.parentElement;
    expect(field?.style.getPropertyValue('--search-trailing-width')).toBe('');
  });
});

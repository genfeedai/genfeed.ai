import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChangeEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Searchbar from './searchbar';

describe('Searchbar', () => {
  it('clears a named filter and restores focus without a supplied ref', async () => {
    const values: string[] = [];
    const onChange = vi.fn((event: ChangeEvent<HTMLInputElement>) => {
      values.push(event.currentTarget.value);
      expect(event.currentTarget).toBe(screen.getByRole('textbox'));
      expect(event.target).toBe(screen.getByRole('textbox'));
      expect(event.nativeEvent).toBeInstanceOf(Event);
      event.preventDefault();
      expect(event.isDefaultPrevented()).toBe(true);
    });
    render(
      <Searchbar ariaLabel="Search brands" value="Acme" onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ name: 'search' }),
      }),
    );
    expect(values).toEqual(['']);
    expect(
      screen.getByRole('textbox', { name: 'Search brands' }),
    ).toHaveFocus();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Zenith' },
    });
    expect(onChange.mock.calls.at(-1)?.[0].target.name).toBe('search');
  });
  it('does not allow clearing a disabled search', async () => {
    const onClear = vi.fn();
    render(<Searchbar value="Acme" isDisabled onClear={onClear} />);
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onClear).not.toHaveBeenCalled();
  });
});

describe('Searchbar with onSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows keystrokes immediately but commits once after the debounce', () => {
    const onSearch = vi.fn();
    render(<Searchbar value="" onSearch={onSearch} debounceMs={300} />);
    const input = screen.getByRole<HTMLInputElement>('textbox');

    fireEvent.change(input, { target: { value: 'r' } });
    fireEvent.change(input, { target: { value: 're' } });
    fireEvent.change(input, { target: { value: 'rem' } });

    expect(input.value).toBe('rem');
    expect(onSearch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(onSearch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('rem');
  });

  it('commits immediately on Enter and does not double-fire', () => {
    const onSearch = vi.fn();
    render(<Searchbar value="" onSearch={onSearch} />);
    const input = screen.getByRole<HTMLInputElement>('textbox');

    fireEvent.change(input, { target: { value: 'remix' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('remix');

    act(() => {
      vi.runAllTimers();
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('clears immediately and cancels a pending commit', () => {
    const onSearch = vi.fn();
    render(<Searchbar value="" onSearch={onSearch} />);
    const input = screen.getByRole<HTMLInputElement>('textbox');

    fireEvent.change(input, { target: { value: 'pending' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(input.value).toBe('');
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('');
    expect(input).toHaveFocus();

    act(() => {
      vi.runAllTimers();
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('re-syncs the draft when the committed value changes from outside', () => {
    const onSearch = vi.fn();
    const { rerender } = render(<Searchbar value="one" onSearch={onSearch} />);
    const input = screen.getByRole<HTMLInputElement>('textbox');
    expect(input.value).toBe('one');

    rerender(<Searchbar value="two" onSearch={onSearch} />);
    expect(input.value).toBe('two');
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('keeps the draft when the parent echoes back our own commit', () => {
    const onSearch = vi.fn();
    const { rerender } = render(<Searchbar value="" onSearch={onSearch} />);
    const input = screen.getByRole<HTMLInputElement>('textbox');

    fireEvent.change(input, { target: { value: 'echo' } });
    act(() => {
      vi.runAllTimers();
    });
    expect(onSearch).toHaveBeenCalledWith('echo');

    fireEvent.change(input, { target: { value: 'echoes' } });
    rerender(<Searchbar value="echo" onSearch={onSearch} />);
    expect(input.value).toBe('echoes');
  });
});

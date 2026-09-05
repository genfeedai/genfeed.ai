import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Searchbar from './searchbar';

describe('Searchbar', () => {
  it('clears a named filter and restores focus without a supplied ref', async () => {
    const onChange = vi.fn();
    render(
      <Searchbar ariaLabel="Search brands" value="Acme" onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: { name: 'search', value: '' } }),
    );
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

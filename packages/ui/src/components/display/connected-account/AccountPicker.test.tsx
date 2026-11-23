import { fireEvent, render, screen } from '@testing-library/react';
import AccountPicker from '@ui/display/connected-account/AccountPicker';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

const items = [
  { handle: 'genfeed', id: 'a', platform: 'instagram' },
  { handle: 'genfeed.tt', id: 'b', platform: 'tiktok' },
  {
    handle: 'genfeedai',
    id: 'c',
    platform: 'twitter',
    warning: 'Needs reconnect',
  },
];

function Multiple({ onChange }: { onChange?: (ids: string[]) => void }) {
  const [value, setValue] = useState<string[]>(['a']);
  return (
    <AccountPicker
      ariaLabel="Accounts"
      items={items}
      onValueChange={(ids) => {
        setValue(ids);
        onChange?.(ids);
      }}
      type="multiple"
      value={value}
    />
  );
}

describe('AccountPicker', () => {
  it('names each account by its handle and marks the chosen ones', () => {
    render(<Multiple />);

    expect(screen.getByRole('group', { name: 'Accounts' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: '@genfeed, Instagram' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: '@genfeed.tt, TikTok' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the handle exactly as stored', () => {
    render(<Multiple />);

    expect(
      screen.getByRole('button', { name: '@genfeed.tt, TikTok' }),
    ).toBeInTheDocument();
  });

  it('adds the warning to the accessible name', () => {
    render(<Multiple />);

    expect(
      screen.getByRole('button', { name: '@genfeedai, X, Needs reconnect' }),
    ).toBeInTheDocument();
  });

  it('toggles accounts independently in multiple mode', () => {
    const onChange = vi.fn();
    render(<Multiple onChange={onChange} />);

    fireEvent.click(
      screen.getByRole('button', { name: '@genfeed.tt, TikTok' }),
    );
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b']);

    fireEvent.click(
      screen.getByRole('button', { name: '@genfeed, Instagram' }),
    );
    expect(onChange).toHaveBeenLastCalledWith(['b']);
  });

  it('keeps one account chosen in single mode unless it can be cleared', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AccountPicker
        ariaLabel="Account"
        items={items}
        onValueChange={onChange}
        value="a"
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: '@genfeed.tt, TikTok' }));
    expect(onChange).toHaveBeenLastCalledWith('b');

    onChange.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: '@genfeed, Instagram' }));
    expect(onChange).not.toHaveBeenCalled();

    rerender(
      <AccountPicker
        ariaLabel="Account"
        isDeselectable
        items={items}
        onValueChange={onChange}
        value="a"
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: '@genfeed, Instagram' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('styles the chosen state from the aria state, which the tooltip cannot overwrite', () => {
    render(<Multiple />);

    const chosen = screen.getByRole('button', { name: '@genfeed, Instagram' });
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    expect(chosen.className).toContain('aria-pressed:ring-primary');
    expect(chosen.className).not.toContain('data-[state=on]');
  });
});

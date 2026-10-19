import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DropdownChannel from '@ui/dropdowns/channel/DropdownChannel';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const accounts = [
  {
    avatarUrl: null,
    id: 'cred-x',
    label: '@genfeedai',
    platform: 'twitter',
  },
  {
    avatarUrl: null,
    id: 'cred-ig',
    label: '@genfeed.studio',
    platform: 'instagram',
  },
];

const channels = [
  { label: 'Instagram', value: 'instagram' },
  { label: 'Website', value: 'web' },
  { label: 'X', value: 'twitter' },
];

function renderDropdown(value = 'all', onChange = vi.fn()) {
  render(
    <DropdownChannel
      accounts={accounts}
      ariaLabel="Channel"
      channels={channels}
      value={value}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe('DropdownChannel', () => {
  it('lists All channels, then connected accounts, with the rest under More', async () => {
    const user = userEvent.setup();
    renderDropdown();

    await user.click(screen.getByRole('button', { name: 'Channel' }));

    const items = screen
      .getAllByRole('menuitemradio')
      .map((item) => item.getAttribute('aria-label') ?? item.textContent);
    expect(items).toEqual(['All channels', '@genfeedai', '@genfeed.studio']);
    expect(screen.getByRole('menuitem', { name: 'More' })).toBeVisible();
    expect(screen.queryByText('Website')).not.toBeInTheDocument();
  });

  it('selects an account by its prefixed id', async () => {
    const user = userEvent.setup();
    const onChange = renderDropdown();

    await user.click(screen.getByRole('button', { name: 'Channel' }));
    await user.click(
      screen.getByRole('menuitemradio', { name: '@genfeed.studio' }),
    );

    expect(onChange).toHaveBeenCalledWith('account:cred-ig');
  });

  it('selects a platform from the More sub-menu', async () => {
    const user = userEvent.setup();
    const onChange = renderDropdown();

    await user.click(screen.getByRole('button', { name: 'Channel' }));
    const more = screen.getByRole('menuitem', { name: 'More' });
    more.focus();
    await user.keyboard('{ArrowRight}');
    await user.click(await screen.findByRole('menuitemradio', { name: 'X' }));

    expect(onChange).toHaveBeenCalledWith('twitter');
  });

  it('shows the selected account on the trigger', () => {
    renderDropdown('account:cred-x');

    expect(screen.getByRole('button', { name: 'Channel' })).toHaveTextContent(
      '@genfeedai',
    );
  });
});

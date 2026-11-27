import type { CreatorAccountsProps } from '@props/content/creator.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CreatorAccounts from './CreatorAccounts';

const brand = {
  id: 'b1',
  socials: [
    {
      handle: 'vincentshipsit',
      platform: 'instagram',
      url: 'https://www.instagram.com/vincentshipsit',
    },
    {
      handle: 'vincent',
      platform: 'tiktok',
      url: 'https://www.tiktok.com/@vincent',
    },
  ],
} as unknown as CreatorAccountsProps['brand'];

function stubPhone(userAgent: string) {
  const assign = vi.fn();
  vi.stubGlobal('location', { assign });
  vi.stubGlobal('navigator', { userAgent });
  return assign;
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

describe('CreatorAccounts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a crawlable web link on every account', () => {
    render(<CreatorAccounts brand={brand} handle="vincentshipsit" />);

    expect(
      screen
        .getByRole('link', { name: 'Instagram: @vincentshipsit' })
        .getAttribute('href'),
    ).toContain('https://www.instagram.com/vincentshipsit');
  });

  it('opens the Instagram app on a phone', () => {
    const assign = stubPhone(IPHONE);
    render(<CreatorAccounts brand={brand} handle="vincentshipsit" />);

    fireEvent.click(
      screen.getByRole('link', { name: 'Instagram: @vincentshipsit' }),
    );

    expect(assign.mock.calls).toEqual([
      ['instagram://user?username=vincentshipsit'],
    ]);
  });

  it('leaves the link alone on a desktop browser', () => {
    const assign = stubPhone(DESKTOP);
    render(<CreatorAccounts brand={brand} handle="vincentshipsit" />);

    fireEvent.click(
      screen.getByRole('link', { name: 'Instagram: @vincentshipsit' }),
    );

    expect(assign.mock.calls).toEqual([]);
  });

  it('leaves a network without an app address to its web link on a phone', () => {
    const assign = stubPhone(IPHONE);
    render(<CreatorAccounts brand={brand} handle="vincentshipsit" />);

    fireEvent.click(screen.getByRole('link', { name: 'TikTok: @vincent' }));

    expect(assign.mock.calls).toEqual([]);
  });
});

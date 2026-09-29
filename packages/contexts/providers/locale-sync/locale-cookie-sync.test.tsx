// @vitest-environment jsdom
'use client';

import { readLocaleCookie } from '@helpers/ui/locale/locale-cookie.helper';
import LocaleCookieSync from '@providers/locale-sync/locale-cookie-sync';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useCurrentUserMock = vi.fn();
const useOrganizationMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => useCurrentUserMock(),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => useOrganizationMock(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ refresh: refreshMock }),
}));

function clearCookies(): void {
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0]?.trim();

    if (name) {
      document.cookie = `${name}=; path=/; max-age=0`;
    }
  }
}

function setPreference(preference: {
  organizationLocale?: string | null;
  userLocale?: string | null;
}): void {
  useCurrentUserMock.mockReturnValue({
    currentUser: { settings: { locale: preference.userLocale } },
  });
  useOrganizationMock.mockReturnValue({
    settings: { defaultLocale: preference.organizationLocale },
  });
}

describe('LocaleCookieSync', () => {
  beforeEach(() => {
    clearCookies();
    refreshMock.mockClear();
  });

  it('writes the personal preference into the cookie and refreshes once', () => {
    setPreference({ userLocale: 'en-XA' });

    render(<LocaleCookieSync />);

    expect(readLocaleCookie(document.cookie)).toBe('en-XA');
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the organization default when the user has no preference', () => {
    setPreference({ organizationLocale: 'en-XA', userLocale: null });

    render(<LocaleCookieSync />);

    expect(readLocaleCookie(document.cookie)).toBe('en-XA');
  });

  it('prefers the personal choice over the organization default', () => {
    setPreference({ organizationLocale: 'en-XA', userLocale: 'en' });

    render(<LocaleCookieSync />);

    expect(readLocaleCookie(document.cookie)).toBe('en');
  });
});

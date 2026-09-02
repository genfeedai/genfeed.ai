import { SettingsSurface } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsSearch from './SettingsSearch';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  orgSlug: 'demo',
  brandSlug: 'fud-news',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    brandSlug: mocks.brandSlug,
    orgSlug: mocks.orgSlug,
  }),
}));

vi.mock('@genfeedai/config/license', () => ({
  hasOrganizationBillingHint: () => true,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      empty: 'No settings found',
      hint: '⌘K',
      label: 'Search settings',
      placeholder: 'Search settings…',
    };
    return messages[key] ?? key;
  },
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    inputRef,
    onChange,
    onFocus,
    placeholder,
    value,
  }: {
    inputRef?: { current: HTMLInputElement | null };
    onChange?: (event: { target: { value: string } }) => void;
    onFocus?: () => void;
    placeholder?: string;
    value?: string;
  }) => (
    <input
      ref={(element) => {
        if (inputRef) {
          inputRef.current = element;
        }
      }}
      aria-label="Search settings"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange?.(event)}
      onFocus={onFocus}
    />
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/popover', () => ({
  Popover: ({ children, open }: { children: ReactNode; open?: boolean }) => (
    <div data-open={open}>{children}</div>
  ),
  PopoverAnchor: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="settings-search-results">{children}</div>
  ),
}));

describe('SettingsSearch', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.orgSlug = 'demo';
    mocks.brandSlug = 'fud-news';
  });

  it('renders a settings searchbar with a cmd+k hint', () => {
    render(<SettingsSearch scope={SettingsSurface.PERSONAL} />);

    expect(screen.getByLabelText('Search settings')).toBeInTheDocument();
    expect(screen.getByText('⌘K')).toBeInTheDocument();
  });

  it('keeps personal search inside personal settings', async () => {
    const user = userEvent.setup();
    render(<SettingsSearch scope={SettingsSurface.PERSONAL} />);

    await user.type(screen.getByLabelText('Search settings'), 'theme');

    expect(screen.getByRole('button', { name: /Appearance/ })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^Models/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Organization' }),
    ).not.toBeInTheDocument();
  });

  it('lists organization pages only on organization settings', async () => {
    const user = userEvent.setup();
    render(<SettingsSearch scope={SettingsSurface.ORGANIZATION} />);

    await user.type(screen.getByLabelText('Search settings'), 'model');

    expect(screen.getByRole('button', { name: /^Models/ })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Appearance/ }),
    ).not.toBeInTheDocument();
  });

  it('navigates to the scoped settings href', async () => {
    const user = userEvent.setup();
    render(<SettingsSearch scope={SettingsSurface.PERSONAL} />);

    await user.type(screen.getByLabelText('Search settings'), 'appearance');
    await user.click(screen.getByRole('button', { name: /Appearance/ }));

    expect(mocks.push).toHaveBeenCalledWith('/settings/personal#appearance');
  });

  it('focuses the searchbar on cmd+k', async () => {
    const user = userEvent.setup();
    render(<SettingsSearch scope={SettingsSurface.PERSONAL} />);

    const input = screen.getByLabelText('Search settings');
    expect(input).not.toHaveFocus();

    await user.keyboard('{Meta>}k{/Meta}');

    expect(input).toHaveFocus();
  });
});

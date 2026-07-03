// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import UserDropdown from '@ui/menus/user-dropdown/UserDropdown';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (href: string) => `/acme/~${href.replace(/^\//, '')}`,
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('UserDropdown', () => {
  it('stays consistent with the settings sidebar order and destinations', () => {
    render(<UserDropdown userName="Test User" userEmail="test@example.com" />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Settings' }));

    const items = screen.getAllByRole('menuitem');

    expect(items.map((item) => item.textContent)).toEqual([
      'Personal',
      'Organization',
      'Brands',
      'Help',
    ]);
    expect(screen.getByRole('menuitem', { name: /Personal/i })).toHaveAttribute(
      'href',
      '/settings',
    );
    expect(
      screen.getByRole('menuitem', { name: /Organization/i }),
    ).toHaveAttribute('href', '/acme/~settings');
    expect(screen.getByRole('menuitem', { name: /Brands/i })).toHaveAttribute(
      'href',
      '/acme/~settings/brands',
    );
    expect(screen.getByRole('menuitem', { name: /Help/i })).toHaveAttribute(
      'href',
      '/acme/~settings/help',
    );
  });

  it('limits topbar user settings to personal destinations', () => {
    render(
      <UserDropdown
        settingsScope="user"
        userName="Test User"
        userEmail="test@example.com"
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('menuitem', { name: /Personal/i })).toHaveAttribute(
      'href',
      '/settings',
    );
    expect(screen.getByRole('menuitem', { name: /Help/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Organization/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Brands/i }),
    ).not.toBeInTheDocument();
  });
});

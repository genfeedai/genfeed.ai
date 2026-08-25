// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import UserDropdown from '@ui/menus/user-dropdown/UserDropdown';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    // Mirrors the real orgHref: prefixes the `/:orgSlug/~` scope, keeping the
    // leading slash so org settings resolve to the canonical `/:org/~/settings`.
    orgHref: (href: string) => `/acme/~${href}`,
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

vi.mock('next/image', () => ({
  default: ({
    alt,
    className,
    src,
  }: {
    alt: string;
    className?: string;
    src: string;
  }) => <img src={src} alt={alt} className={className} />,
}));

describe('UserDropdown', () => {
  it('renders an initials avatar trigger when no image is provided', () => {
    render(<UserDropdown userName="Test User" userEmail="test@example.com" />);

    const trigger = screen.getByRole('button', { name: 'Open account menu' });
    expect(trigger).toHaveTextContent('T');
    expect(trigger).toHaveClass('rounded-full');
    expect(screen.getByText('T')).toHaveClass('rounded-full');
  });

  it('renders the user avatar image when provided', () => {
    render(
      <UserDropdown
        userName="Test User"
        userEmail="test@example.com"
        imageUrl="https://cdn.example.com/avatar.png"
      />,
    );

    expect(screen.getByRole('img', { name: 'Test User' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/avatar.png',
    );
    expect(screen.getByRole('img', { name: 'Test User' })).toHaveClass(
      'rounded-full',
    );
  });

  it('uses the full identity row as the account menu trigger', () => {
    render(
      <UserDropdown
        showIdentity
        userName="Test User"
        userEmail="test@example.com"
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Open account menu' });
    expect(trigger).toHaveClass('w-full', 'h-16', 'px-4');
    expect(within(trigger).getByText('Test User')).toBeVisible();
    expect(within(trigger).getByText('test@example.com')).toBeVisible();
    expect(within(trigger).getByText('T')).toBeVisible();
    expect(
      trigger.querySelector('[data-account-menu-affordance]'),
    ).toBeVisible();
  });

  it('matches the expanded sidebar width without repeating its identity header', () => {
    render(
      <UserDropdown
        showIdentity
        userName="Test User"
        userEmail="test@example.com"
      />,
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Open account menu' }),
    );

    expect(screen.getByRole('menu')).toHaveClass(
      'w-[var(--radix-dropdown-menu-trigger-width)]',
    );
    expect(screen.getAllByText('Test User')).toHaveLength(1);
    expect(screen.getAllByText('test@example.com')).toHaveLength(1);
  });

  it('keeps identity context for the compact topbar avatar trigger', () => {
    render(<UserDropdown userName="Test User" userEmail="test@example.com" />);

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Open account menu' }),
    );

    expect(screen.getAllByText('Test User')).toHaveLength(1);
    expect(screen.getAllByText('test@example.com')).toHaveLength(1);
    expect(screen.getByRole('menu')).toHaveClass('w-56');
  });

  it('switches between the settings scopes (Help lives in the personal scope)', () => {
    render(<UserDropdown userName="Test User" userEmail="test@example.com" />);

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Open account menu' }),
    );

    const items = screen
      .getAllByRole('menuitem')
      .filter((item) => item.textContent !== 'Sign out');

    expect(items.map((item) => item.textContent)).toEqual([
      'Personal',
      'Organization',
      'Brands',
      'Help',
    ]);
    expect(screen.getByRole('menuitem', { name: /Personal/i })).toHaveAttribute(
      'href',
      '/settings/personal',
    );
    expect(
      screen.getByRole('menuitem', { name: /Organization/i }),
    ).toHaveAttribute('href', '/acme/~/settings/general');
    expect(screen.getByRole('menuitem', { name: /Brands/i })).toHaveAttribute(
      'href',
      '/acme/~/settings/brands',
    );
    // Help is a personal-scope destination, not org-scoped.
    expect(screen.getByRole('menuitem', { name: /Help/i })).toHaveAttribute(
      'href',
      '/settings/help',
    );
  });

  it('limits topbar user settings to personal destinations plus sign out', () => {
    render(
      <UserDropdown
        settingsScope="user"
        userName="Test User"
        userEmail="test@example.com"
      />,
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Open account menu' }),
    );

    expect(screen.getByRole('menuitem', { name: /Personal/i })).toHaveAttribute(
      'href',
      '/settings/personal',
    );
    expect(screen.getByRole('menuitem', { name: /Help/i })).toHaveAttribute(
      'href',
      '/settings/help',
    );
    expect(screen.getByRole('menuitem', { name: /Sign out/i })).toHaveAttribute(
      'href',
      '/logout',
    );
    expect(
      screen.queryByRole('menuitem', { name: /Organization/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Brands/i }),
    ).not.toBeInTheDocument();
  });

  it('exposes organization and brand settings in the full-scope menu', () => {
    render(
      <UserDropdown
        settingsScope="all"
        userName="Test User"
        userEmail="test@example.com"
      />,
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Open account menu' }),
    );

    expect(
      screen.getByRole('menuitem', { name: /Organization/i }),
    ).toHaveAttribute('href', '/acme/~/settings/general');
    expect(screen.getByRole('menuitem', { name: /Brands/i })).toHaveAttribute(
      'href',
      '/acme/~/settings/brands',
    );
    expect(screen.getByRole('menuitem', { name: /Sign out/i })).toHaveAttribute(
      'href',
      '/logout',
    );
  });
});

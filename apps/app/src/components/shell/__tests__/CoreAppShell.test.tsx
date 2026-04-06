import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CoreAppShell from '../CoreAppShell';

vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: vi.fn(), theme: 'dark' }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/workflows',
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string }) => <img alt={alt} {...props} />,
}));

describe('CoreAppShell', () => {
  it('renders content shell', () => {
    render(
      <CoreAppShell>
        <div>Test Content</div>
      </CoreAppShell>,
    );
    expect(screen.getByTestId('core-content-shell')).toBeInTheDocument();
  });

  it('renders main content area', () => {
    render(
      <CoreAppShell>
        <div>Test Content</div>
      </CoreAppShell>,
    );
    expect(screen.getByTestId('core-main-content')).toBeInTheDocument();
  });

  it('renders children inside main content', () => {
    render(
      <CoreAppShell>
        <div data-testid="child-content">Test Content</div>
      </CoreAppShell>,
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('renders topbar shell', () => {
    render(
      <CoreAppShell>
        <div>Test</div>
      </CoreAppShell>,
    );
    expect(screen.getByTestId('core-topbar-shell')).toBeInTheDocument();
  });

  it('renders desktop sidebar rail', () => {
    render(
      <CoreAppShell>
        <div>Test</div>
      </CoreAppShell>,
    );
    expect(screen.getByTestId('desktop-sidebar-rail')).toBeInTheDocument();
  });

  it('renders sidebar shell inside desktop rail', () => {
    render(
      <CoreAppShell>
        <div>Test</div>
      </CoreAppShell>,
    );
    expect(screen.getByTestId('sidebar-shell')).toBeInTheDocument();
  });
});

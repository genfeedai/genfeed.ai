import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeMenu from './ThemeMenu';

const { useThemeMock } = vi.hoisted(() => ({
  useThemeMock: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: useThemeMock,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    ariaLabel,
    children,
  }: {
    ariaLabel?: string;
    children?: ReactNode;
  }) => <button aria-label={ariaLabel}>{children}</button>,
}));

vi.mock('@ui/primitives/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuLabel: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
}));

describe('ThemeMenu', () => {
  beforeEach(() => {
    useThemeMock.mockReturnValue({ setTheme: vi.fn(), theme: 'dark' });
  });

  it('uses deterministic System markup before mounting', () => {
    const markup = renderToStaticMarkup(<ThemeMenu />);

    expect(markup).toContain('aria-label="Appearance: System"');
    expect(markup).not.toContain('aria-label="Appearance: Dark"');
  });

  it('adopts the stored preference after mounting', () => {
    render(<ThemeMenu />);

    expect(
      screen.getByRole('button', { name: 'Appearance: Dark' }),
    ).toBeInTheDocument();
  });

  it('uses the readable muted foreground role for its label', () => {
    render(<ThemeMenu />);

    expect(screen.getByText('Appearance')).toHaveClass(
      'text-muted-foreground',
    );
  });
});

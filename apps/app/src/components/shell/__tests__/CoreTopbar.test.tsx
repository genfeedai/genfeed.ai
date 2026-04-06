import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CoreTopbar from '../CoreTopbar';

const mockSetTheme = vi.fn();
let mockTheme = 'dark';

vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: mockSetTheme, theme: mockTheme }),
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

describe('CoreTopbar', () => {
  it('renders the topbar element', () => {
    render(<CoreTopbar />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('renders Core OSS label', () => {
    render(<CoreTopbar />);
    expect(screen.getByText('Core OSS')).toBeInTheDocument();
  });

  it('renders logo link to workspace overview', () => {
    render(<CoreTopbar />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/workspace/overview');
  });

  it('renders theme toggle button', () => {
    render(<CoreTopbar />);
    expect(
      screen.getByRole('button', { name: 'Toggle theme' }),
    ).toBeInTheDocument();
  });

  it('calls setTheme with light when currently dark', () => {
    mockTheme = 'dark';
    render(<CoreTopbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('calls setTheme with dark when currently light', () => {
    mockTheme = 'light';
    render(<CoreTopbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('renders mobile hamburger when onMenuToggle provided', () => {
    const onMenuToggle = vi.fn();
    render(<CoreTopbar onMenuToggle={onMenuToggle} />);
    const hamburger = screen.getByRole('button', {
      name: 'Open navigation menu',
    });
    expect(hamburger).toBeInTheDocument();
    fireEvent.click(hamburger);
    expect(onMenuToggle).toHaveBeenCalled();
  });

  it('shows close icon when menu is open', () => {
    render(<CoreTopbar isMenuOpen onMenuToggle={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Close navigation menu' }),
    ).toBeInTheDocument();
  });
});

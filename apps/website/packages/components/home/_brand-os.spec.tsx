import { render, screen } from '@testing-library/react';
import * as Module from '@web-components/home/_brand-os';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import HomeBrandOS from './_brand-os';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@ui/buttons/tracked/ButtonTracked', () => ({
  default: ({
    asChild: _asChild,
    children,
  }: {
    asChild?: boolean;
    children: ReactNode;
  }) => <>{children}</>,
}));

describe('HomeBrandOS', () => {
  it('exports a default component', () => {
    expect(Module).toHaveProperty('default');
    expect(typeof Module.default).toBe('function');
  });

  it('links the homepage entry point to the Brand OS route', () => {
    render(<HomeBrandOS />);

    expect(
      screen.getByRole('heading', {
        name: /build a source-backed brand system/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /preview brand os/i }),
    ).toHaveAttribute('href', '/brand-os');
  });
});

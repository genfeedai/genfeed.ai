// biome-ignore assist/source/organizeImports: External packages precede project aliases.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import WebsiteTopbar from '@ui/shell/topbars/WebsiteTopbar';

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ isSignedIn: false }),
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      app: 'https://app.genfeed.ai',
    },
    calendly: 'https://calendly.com/genfeed/demo',
    mcpConnectHref: 'https://app.genfeed.ai/connect',
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('WebsiteTopbar', () => {
  it('leads with the primary creation action and studio navigation', () => {
    render(<WebsiteTopbar />);

    expect(
      screen.getByRole('link', { name: /start creating/i }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up');
    expect(screen.getByRole('link', { name: /book a demo/i })).toHaveAttribute(
      'href',
      'https://calendly.com/genfeed/demo',
    );
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing',
    );
    // Docs and the changelog live in the footer: the bar sells the product,
    // it is not the site index.
    expect(
      screen.queryByRole('link', { name: 'Docs' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /changelog/i }),
    ).not.toBeInTheDocument();
  });

  it('leads with the audience question, then what it is and how to buy it', () => {
    render(<WebsiteTopbar />);

    const menus = screen
      .getAllByRole('button', { expanded: false })
      .map((trigger) => trigger.textContent?.trim());

    expect(menus).toEqual(['Use Cases', 'Product', 'Solutions']);
  });

  it('groups delivery shapes under solutions', () => {
    render(<WebsiteTopbar />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: /solutions/i }));

    for (const group of ['Self-serve', 'Automated', 'Managed']) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }

    for (const [label, href] of [
      ['Teams', '/cloud'],
      ['Hire Agents', '/hire-agents'],
      ['Done For You', '/done-for-you'],
      ['Services', '/services'],
    ]) {
      expect(
        screen.getByRole('link', { name: new RegExp(label, 'i') }),
      ).toHaveAttribute('href', href);
    }
  });

  it('lists audiences under use cases without leaking the self-host story', () => {
    render(<WebsiteTopbar />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: /use cases/i }));

    for (const group of ['Solo', 'Teams', 'Commerce']) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }

    for (const [label, href] of [
      ['Creators', '/use-cases/creators'],
      ['Founders', '/use-cases/founders'],
      ['AI Influencers', '/use-cases/ai-influencers'],
      ['Agencies', '/use-cases/agencies'],
      ['Marketers', '/use-cases/marketers'],
      ['E-Commerce', '/use-cases/ecommerce'],
      ['Browse all use cases', '/use-cases'],
    ]) {
      expect(
        screen.getByRole('link', { name: new RegExp(label, 'i') }),
      ).toHaveAttribute('href', href);
    }

    expect(
      screen.queryByRole('link', { name: /self-host|open source/i }),
    ).not.toBeInTheDocument();
  });

  it('exposes studio, models, publishing, analytics, control plane, and MCP server', () => {
    render(<WebsiteTopbar />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: /product/i }));

    expect(screen.getByRole('button', { name: /product/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    for (const group of ['Create', 'Operate', 'Build']) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }

    for (const destination of [
      'Studio',
      'Models',
      'Publishing',
      'Analytics',
      'Control Plane',
      'MCP Server',
    ]) {
      expect(
        screen.getByRole('link', { name: new RegExp(destination, 'i') }),
      ).toBeInTheDocument();
    }
  });

  it('does not expose a marketing-site appearance control', () => {
    render(<WebsiteTopbar />);

    expect(
      screen.queryByRole('button', { name: /Appearance/i }),
    ).not.toBeInTheDocument();
  });
});

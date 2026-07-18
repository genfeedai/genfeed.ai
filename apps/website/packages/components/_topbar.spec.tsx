import { fireEvent, render, screen } from '@testing-library/react';
import WebsiteTopbar from '@ui/shell/topbars/WebsiteTopbar';
import { describe, expect, it, vi } from 'vitest';

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
  it('prioritizes MCP with the simplified developer navigation', () => {
    render(<WebsiteTopbar />);

    expect(screen.getByRole('link', { name: /connect mcp/i })).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/connect',
    );
    expect(screen.getByRole('link', { name: /book a demo/i })).toHaveAttribute(
      'href',
      'https://calendly.com/genfeed/demo',
    );
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing',
    );
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
      'href',
      'https://docs.genfeed.ai',
    );
    expect(
      screen.queryByRole('button', { name: /use cases/i }),
    ).not.toBeInTheDocument();
  });

  it('exposes MCP, publishing, control plane, analytics, and self-hosting', () => {
    render(<WebsiteTopbar />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: /product/i }));

    for (const destination of [
      'MCP Server',
      'Publishing',
      'Control Plane',
      'Analytics',
      'Self-hosting',
    ]) {
      expect(
        screen.getByRole('link', { name: new RegExp(destination, 'i') }),
      ).toBeInTheDocument();
    }
  });
});

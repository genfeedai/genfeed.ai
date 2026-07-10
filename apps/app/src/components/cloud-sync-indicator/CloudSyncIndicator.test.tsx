import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CloudSyncIndicator from './CloudSyncIndicator';

const cloudSessionState = vi.hoisted(() => ({
  isConnected: false,
}));

vi.mock('@/hooks/useCloudSession', () => ({
  useCloudSession: () => cloudSessionState,
}));

vi.mock('@/components/desktop/DesktopLocalProviderSettings', () => ({
  default: () => <div data-testid="desktop-local-provider-settings" />,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    ariaLabel,
    children,
    onClick,
  }: {
    ariaLabel?: string;
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('CloudSyncIndicator', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    cloudSessionState.isConnected = false;
    delete process.env.GENFEED_CLOUD;
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
    delete process.env.NEXT_PUBLIC_GENFEED_CLOUD;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'localhost' },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
    });
  });

  it('does not infer cloud deployment from the hosted app hostname', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: 'app.genfeed.ai' },
      writable: true,
    });

    render(<CloudSyncIndicator />);

    expect(
      screen.getByRole('button', { name: 'Cloud disconnected' }),
    ).toBeInTheDocument();
  });

  it('does not render when the cloud env uses the canonical numeric flag', () => {
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = '1';

    render(<CloudSyncIndicator />);

    expect(
      screen.queryByRole('button', { name: 'Cloud disconnected' }),
    ).not.toBeInTheDocument();
  });

  it('renders for local hybrid mode', () => {
    render(<CloudSyncIndicator />);

    expect(
      screen.getByRole('button', { name: 'Cloud disconnected' }),
    ).toBeInTheDocument();
  });
});

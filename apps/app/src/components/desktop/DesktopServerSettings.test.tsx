import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopServerSettings from './DesktopServerSettings';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('common.desktop.server');

  return { useTranslations: () => translate };
});

const mocks = vi.hoisted(() => ({
  bridge: null as null | {
    server: {
      getState: ReturnType<typeof vi.fn>;
      select: ReturnType<typeof vi.fn>;
      validateSelfHosted: ReturnType<typeof vi.fn>;
    };
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    ariaLabel,
    children,
    isDisabled,
    onClick,
  }: {
    ariaLabel?: string;
    children: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
  }) => (
    <button
      aria-label={ariaLabel}
      disabled={isDisabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@ui/primitives/field', () => ({
  default: ({ children, label }: { children: ReactNode; label?: string }) => (
    <label>
      {label}
      {children}
    </label>
  ),
}));

vi.mock('@/lib/desktop/runtime', () => ({
  getDesktopBridge: () => mocks.bridge,
}));

const cloudProfile = {
  apiEndpoint: 'https://api.genfeed.ai/v1',
  appEndpoint: 'https://app.genfeed.ai',
  authEndpoint: 'https://app.genfeed.ai/oauth/cli',
  id: 'cloud',
  kind: 'cloud',
  label: 'Genfeed Cloud',
  mcpEndpoint: 'https://mcp.genfeed.ai/mcp',
  wsEndpoint: 'https://notifications.genfeed.ai',
};

describe('DesktopServerSettings', () => {
  beforeEach(() => {
    mocks.bridge = {
      server: {
        getState: vi.fn().mockResolvedValue({
          active: cloudProfile,
          cloud: cloudProfile,
          defaultProfile: cloudProfile,
          isUsingDefault: true,
          selfHosted: null,
          signedInServerIds: ['cloud'],
        }),
        select: vi.fn().mockResolvedValue(undefined),
        validateSelfHosted: vi.fn().mockResolvedValue({
          isValid: true,
          profile: {
            ...cloudProfile,
            apiEndpoint: 'https://api.acme.dev/v1',
            id: 'self-hosted-1',
            kind: 'self-hosted',
            mcpEndpoint: 'https://mcp.acme.dev/mcp',
          },
        }),
      },
    };
  });

  it('shows the active server and its sign-in state', async () => {
    render(<DesktopServerSettings />);

    expect(
      await screen.findByText(/Connected to Genfeed Cloud\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Current server' }),
    ).toBeDisabled();
    expect(screen.getAllByText('Signed in').length).toBeGreaterThan(0);
  });

  it('tests and switches to a self-hosted server', async () => {
    render(<DesktopServerSettings />);
    await screen.findByText(/Connected to Genfeed Cloud\./);

    fireEvent.click(screen.getByRole('button', { name: 'Self-hosted' }));
    fireEvent.change(
      screen.getByPlaceholderText('https://api.example.com/v1'),
      {
        target: { value: ' https://api.acme.dev ' },
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => {
      expect(mocks.bridge?.server.validateSelfHosted).toHaveBeenCalledWith({
        apiEndpoint: 'https://api.acme.dev',
      });
    });
    expect(
      await screen.findByText(
        /Agent tools will use https:\/\/mcp\.acme\.dev\/mcp/,
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch and restart' }));
    await waitFor(() => {
      expect(mocks.bridge?.server.select).toHaveBeenCalledWith({
        kind: 'self-hosted',
        selfHosted: { apiEndpoint: 'https://api.acme.dev' },
      });
    });
  });

  it('shows why a switch failed', async () => {
    mocks.bridge?.server.select.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'desktop:server:select': Error: Server switch was cancelled.",
      ),
    );
    render(<DesktopServerSettings />);
    await screen.findByText(/Connected to Genfeed Cloud\./);

    fireEvent.click(screen.getByRole('button', { name: 'Self-hosted' }));
    fireEvent.change(
      screen.getByPlaceholderText('https://api.example.com/v1'),
      {
        target: { value: 'https://api.acme.dev' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch and restart' }));

    expect(
      await screen.findByText('Server switch was cancelled.'),
    ).toBeInTheDocument();
  });

  it('renders nothing outside Genfeed Desktop', () => {
    mocks.bridge = null;
    const { container } = render(<DesktopServerSettings />);

    expect(container).toBeEmptyDOMElement();
  });
});

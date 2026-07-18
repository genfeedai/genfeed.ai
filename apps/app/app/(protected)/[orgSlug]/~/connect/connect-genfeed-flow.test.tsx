import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConnectGenfeedFlow from './connect-genfeed-flow';

const MCP_SCOPES = [
  'videos:read',
  'videos:create',
  'images:read',
  'images:create',
  'prompts:read',
  'prompts:create',
  'articles:read',
  'articles:create',
  'brands:read',
  'credits:read',
  'posts:create',
  'analytics:read',
];
const CREATED_TEST_KEY = ['gf', 'test', 'created-secret-value-1234567890'].join(
  '_',
);
const STORED_TEST_KEY = ['gf', 'test', 'stored-secret-value-1234567890'].join(
  '_',
);
const TRUNCATED_TEST_KEY = ['gf', 'test', 'truncated-secret'].join('_');

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  createApiKey: vi.fn(),
  findAll: vi.fn(),
  verifyMcpConnection: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brands: [{ slug: 'main' }],
    isReady: true,
    organizationId: 'org-1',
    settings: { subscriptionTier: 'pro' },
  }),
}));

vi.mock('@genfeedai/config/deployment', () => ({
  getDeployment: () => 'cloud',
  isSelfHostedDeployment: () => false,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('test-token'),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    mcpEndpoint: 'https://mcp.genfeed.ai/mcp',
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

vi.mock('@services/management/api-keys.service', () => ({
  ApiKeysService: {
    getInstance: () => ({
      createApiKey: mocks.createApiKey,
      findAll: mocks.findAll,
      verifyMcpConnection: mocks.verifyMcpConnection,
    }),
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme' }),
}));

vi.mock('@/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/analytics')>()),
  captureAnalyticsEvent: mocks.capture,
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    bodyClassName,
    children,
    description,
    label,
  }: {
    bodyClassName?: string;
    children: ReactNode;
    description?: string;
    label?: string;
  }) => (
    <section>
      {label ? <h2>{label}</h2> : null}
      {description ? <p>{description}</p> : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    ariaLabel,
    asChild,
    children,
    icon,
    isDisabled,
    isLoading,
    onClick,
    variant: _variant,
    withWrapper: _withWrapper,
    ...props
  }: {
    ariaLabel?: string;
    asChild?: boolean;
    children?: ReactNode;
    icon?: ReactNode;
    isDisabled?: boolean;
    isLoading?: boolean;
    onClick?: () => void;
    variant?: string;
    withWrapper?: boolean;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    asChild ? (
      children
    ) : (
      <button
        aria-label={ariaLabel}
        disabled={isDisabled || isLoading}
        onClick={onClick}
        type="button"
        {...props}
      >
        {icon}
        {isLoading ? 'Loading' : children}
      </button>
    ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@ui/primitives/alert', () => ({
  Alert: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock('@ui/primitives/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

function activeKey() {
  return {
    id: 'key-1',
    label: 'MCP key',
    scopes: MCP_SCOPES,
  };
}

describe('ConnectGenfeedFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAll.mockResolvedValue([activeKey()]);
    mocks.createApiKey.mockResolvedValue({
      ...activeKey(),
      id: 'key-2',
      key: CREATED_TEST_KEY,
    });
    mocks.verifyMcpConnection.mockResolvedValue({
      keyId: 'key-1',
      publishing: { connectedAccountCount: 1, isReady: true },
      status: 'connected',
      verifiedAt: '2026-07-18T12:00:00.000Z',
    });
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders each client and secret-safe Codex configuration', async () => {
    render(<ConnectGenfeedFlow />);

    expect(await screen.findByText('MCP key')).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Claude Code' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Codex' })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Generic MCP' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'codex mcp add genfeed --url https://mcp.genfeed.ai/mcp --bearer-token-env-var GENFEED_API_KEY',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/gf_live_[A-Za-z0-9]/)).not.toBeInTheDocument();
  });

  it('verifies an existing key and opens the first draft handoff', async () => {
    render(<ConnectGenfeedFlow />);

    await screen.findByText('MCP key');
    fireEvent.change(
      screen.getByLabelText('Stored value for the selected key'),
      {
        target: { value: STORED_TEST_KEY },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Verify MCP connection' }),
    );

    expect(await screen.findByText('Connection verified')).toBeInTheDocument();
    expect(
      screen.getByText(
        'List my Genfeed brands, then create a draft social post for review. Do not publish it.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /open draft composer/i }),
    ).toHaveAttribute('href', '/acme/main/compose/post');
    expect(
      screen.getByRole('button', { name: 'Verify MCP connection' }),
    ).toBeEnabled();
    expect(mocks.verifyMcpConnection).toHaveBeenCalledWith('key-1', {
      key: STORED_TEST_KEY,
    });
  });

  it('shows copy-once key output and missing publishing readiness guidance', async () => {
    mocks.findAll.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        ...activeKey(),
        id: 'key-2',
      },
    ]);
    mocks.verifyMcpConnection.mockResolvedValue({
      keyId: 'key-2',
      publishing: { connectedAccountCount: 0, isReady: false },
      status: 'connected',
      verifiedAt: '2026-07-18T12:00:00.000Z',
    });

    render(<ConnectGenfeedFlow />);

    fireEvent.click(
      await screen.findByRole('button', { name: /create scoped mcp key/i }),
    );
    expect(await screen.findByText(CREATED_TEST_KEY)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Verify MCP connection' }),
    );

    expect(
      await screen.findByText('Connect a publishing account'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: /connect publishing integration/i,
      }),
    ).toHaveAttribute('href', '/acme/~/settings/brands');
  });

  it('distinguishes invalid scope failures', async () => {
    mocks.verifyMcpConnection.mockResolvedValue({
      message: 'The selected key is missing guided-flow scopes.',
      missingScopes: ['posts:create'],
      reason: 'invalid_scope',
      status: 'failed',
    });

    render(<ConnectGenfeedFlow />);

    await screen.findByText('MCP key');
    fireEvent.change(
      screen.getByLabelText('Stored value for the selected key'),
      {
        target: { value: STORED_TEST_KEY },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Verify MCP connection' }),
    );

    expect(
      await screen.findByText('Key scopes need attention'),
    ).toBeInTheDocument();
    expect(screen.getByText('Missing: posts:create')).toBeInTheDocument();
  });

  it('classifies rejected malformed keys without logging the secret', async () => {
    mocks.verifyMcpConnection.mockRejectedValue({ status: 400 });

    render(<ConnectGenfeedFlow />);

    await screen.findByText('MCP key');
    fireEvent.change(
      screen.getByLabelText('Stored value for the selected key'),
      {
        target: { value: TRUNCATED_TEST_KEY },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Verify MCP connection' }),
    );

    expect(
      await screen.findByText('Key verification failed'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/enter the complete copy-once Genfeed key/i),
    ).toBeInTheDocument();
  });
});

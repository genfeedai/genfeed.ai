import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsApiKeysPage from './content';

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (path: string) =>
      `/test-org/~${path.startsWith('/') ? path : `/${path}`}`,
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

const mocks = vi.hoisted(() => ({
  authedServices: new WeakMap<
    (token: string) => unknown,
    () => Promise<unknown>
  >(),
  createApiKey: vi.fn(),
  desktop: false,
  findAllApiKeys: vi.fn(),
  getApiKeysService: vi.fn(),
  getByokAllProviders: vi.fn(),
  getOrganizationsService: vi.fn(),
  isReady: true,
  isSelfHosted: false,
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  organizationId: 'org-1',
  removeByokProviderKey: vi.fn(),
  revokeApiKey: vi.fn(),
  rotateApiKey: vi.fn(),
  saveByokProviderKey: vi.fn(),
  settingsSubscriptionTier: 'pro',
  validateByokProviderKey: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    isReady: mocks.isReady,
    organizationId: mocks.organizationId,
    settings: { subscriptionTier: mocks.settingsSubscriptionTier },
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const existingService = mocks.authedServices.get(factory);

    if (existingService) {
      return existingService;
    }

    const service = async () => factory('test-token');
    mocks.authedServices.set(factory, service);
    return service;
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationsError,
      success: mocks.notificationsSuccess,
    }),
  },
}));

vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: () => ({
      getByokAllProviders: mocks.getByokAllProviders,
      removeByokProviderKey: mocks.removeByokProviderKey,
      saveByokProviderKey: mocks.saveByokProviderKey,
      validateByokProviderKey: mocks.validateByokProviderKey,
    }),
  },
}));

vi.mock('@services/management/api-keys.service', () => ({
  ApiKeysService: {
    getInstance: () => ({
      createApiKey: mocks.createApiKey,
      findAll: mocks.findAllApiKeys,
      revokeApiKey: mocks.revokeApiKey,
      rotateApiKey: mocks.rotateApiKey,
    }),
  },
}));

vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="hi-chevron-down" />,
  ChevronRight: () => <span data-testid="hi-chevron-right" />,
  Clipboard: () => <span data-testid="hi-clipboard-document" />,
  Plus: () => <span data-testid="hi-plus" />,
  RefreshCw: () => <span data-testid="hi-arrow-path" />,
  Trash2: () => <span data-testid="hi-trash" />,
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    bodyClassName,
    children,
    className,
    description,
    headerAction,
    label,
    ...props
  }: {
    bodyClassName?: string;
    children: ReactNode;
    className?: string;
    description?: string;
    headerAction?: ReactNode;
    label?: string;
  } & React.HTMLAttributes<HTMLElement>) => (
    <section className={className} {...props}>
      {(label || description || headerAction) && (
        <div>
          {label ? <h3>{label}</h3> : null}
          {description ? <p>{description}</p> : null}
          {headerAction}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  ),
}));

function resolveButtonLabel(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) {
    return children
      .map(resolveButtonLabel)
      .filter((label) => label !== 'Icon Button')
      .join(' ');
  }
  if (children != null) return 'Icon Button';
  return '';
}

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    asChild,
    children,
    className: _className,
    isDisabled,
    onClick,
    variant: _variant,
    ...buttonProps
  }: {
    asChild?: boolean;
    children?: ReactNode;
    className?: string;
    isDisabled?: boolean;
    onClick?: () => void;
    variant?: unknown;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
    if (asChild) {
      return <>{children}</>;
    }

    return (
      <button
        type="button"
        disabled={isDisabled}
        onClick={onClick}
        {...buttonProps}
      >
        {resolveButtonLabel(children)}
      </button>
    );
  },
}));

vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: ({
    isChecked,
    label,
    onCheckedChange,
  }: {
    isChecked?: boolean;
    label?: ReactNode;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <label>
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
      />
      {label}
    </label>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@/components/desktop/DesktopLocalProviderSettings', () => ({
  default: ({ variant }: { variant?: string }) => (
    <div>Desktop providers: {variant}</div>
  ),
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isDesktopClient: () => mocks.desktop,
  isSelfHostedDeployment: () => mocks.isSelfHosted,
}));

function providerStatuses() {
  return [
    {
      description: 'Hosted OpenAI fallback remains available.',
      docsUrl: 'https://platform.openai.com',
      hasKey: false,
      isEnabled: false,
      label: 'OpenAI',
      provider: 'openai',
      requiresSecret: false,
    },
    {
      description: 'Replicate model access.',
      docsUrl: 'https://replicate.com',
      hasKey: true,
      isEnabled: true,
      label: 'Replicate',
      maskedKey: 'r8_****1234',
      provider: 'replicate',
      requiresSecret: true,
    },
  ];
}

function productApiKeys() {
  return [
    {
      id: 'key-1',
      label: 'MCP Key',
      lastUsedAt: null,
      scopes: ['videos:read', 'analytics:read'],
    },
  ];
}

describe('SettingsApiKeysPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.desktop = false;
    mocks.isReady = true;
    mocks.isSelfHosted = false;
    mocks.organizationId = 'org-1';
    mocks.settingsSubscriptionTier = 'pro';
    mocks.getByokAllProviders.mockResolvedValue(providerStatuses());
    mocks.findAllApiKeys.mockResolvedValue(productApiKeys());
    mocks.createApiKey.mockResolvedValue({
      id: 'key-2',
      key: 'gf_test_created',
      label: 'MCP Server',
      scopes: ['videos:read'],
    });
    mocks.revokeApiKey.mockResolvedValue({
      id: 'key-1',
      isRevoked: true,
      label: 'MCP Key',
    });
    mocks.rotateApiKey.mockResolvedValue({
      id: 'key-3',
      key: 'gf_test_rotated',
      label: 'MCP Key',
      scopes: ['videos:read'],
    });
    mocks.getApiKeysService.mockResolvedValue({
      createApiKey: mocks.createApiKey,
      findAll: mocks.findAllApiKeys,
      revokeApiKey: mocks.revokeApiKey,
      rotateApiKey: mocks.rotateApiKey,
    });
    mocks.getOrganizationsService.mockResolvedValue({
      getByokAllProviders: mocks.getByokAllProviders,
      removeByokProviderKey: mocks.removeByokProviderKey,
      saveByokProviderKey: mocks.saveByokProviderKey,
      validateByokProviderKey: mocks.validateByokProviderKey,
    });
    mocks.removeByokProviderKey.mockResolvedValue({});
    mocks.saveByokProviderKey.mockResolvedValue({});
    mocks.validateByokProviderKey.mockResolvedValue({ isValid: true });
  });

  it('loads Genfeed API keys without provider tabs', async () => {
    render(<SettingsApiKeysPage />);

    expect(await screen.findByText('API keys')).toBeInTheDocument();
    expect(await screen.findByText('MCP Key')).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Genfeed keys' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Provider keys' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('OpenAI')).not.toBeInTheDocument();
    expect(mocks.findAllApiKeys).toHaveBeenCalledWith({ limit: 100 });
  });

  it('switches scope presets and reflects the active preset', async () => {
    render(<SettingsApiKeysPage />);

    await screen.findByText('MCP Key');

    const mcp = screen.getByRole('button', { name: 'MCP' });
    const read = screen.getByRole('button', { name: 'Read' });
    const content = screen.getByRole('button', { name: 'Content' });

    expect(mcp).toHaveAttribute('aria-pressed', 'true');
    expect(read).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(read);
    expect(read).toHaveAttribute('aria-pressed', 'true');
    expect(mcp).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(content);
    expect(content).toHaveAttribute('aria-pressed', 'true');
    expect(read).toHaveAttribute('aria-pressed', 'false');
  });

  it('creates a Genfeed API key and shows the plain key once', async () => {
    render(<SettingsApiKeysPage />);

    await screen.findByText('MCP Key');
    fireEvent.change(screen.getByPlaceholderText('MCP Server'), {
      target: { value: 'Automation MCP' },
    });
    fireEvent.change(screen.getByPlaceholderText('Used by local MCP server'), {
      target: { value: 'Used by CI' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Key' }));

    await waitFor(() => {
      expect(mocks.createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Used by CI',
          label: 'Automation MCP',
          scopes: expect.arrayContaining(['videos:read', 'analytics:read']),
        }),
      );
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'API key created',
      );
    });

    expect(screen.getByText('gf_test_created')).toBeInTheDocument();
  });

  it('locks the API keys page for free-tier organizations', async () => {
    mocks.settingsSubscriptionTier = 'free';
    render(<SettingsApiKeysPage />);

    expect(
      await screen.findByText('Unlock API keys with Pro'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/API access is included on paid plans/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Upgrade to Pro/i }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/settings/subscription'),
    );
    expect(
      screen.queryByRole('button', { name: 'Create Key' }),
    ).not.toBeInTheDocument();
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });

  it('rotates and revokes Genfeed API keys', async () => {
    render(<SettingsApiKeysPage />);

    await screen.findByText('MCP Key');
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));

    await waitFor(() => {
      expect(mocks.rotateApiKey).toHaveBeenCalledWith('key-1');
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'API key rotated',
      );
    });
    expect(screen.getByText('gf_test_rotated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(mocks.revokeApiKey).toHaveBeenCalledWith('key-1');
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'API key revoked',
      );
    });
  });
});

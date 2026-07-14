import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsApiKeysPage from './content';

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

vi.mock('react-icons/hi2', () => ({
  HiArrowPath: () => <span data-testid="hi-arrow-path" />,
  HiClipboardDocument: () => <span data-testid="hi-clipboard-document" />,
  HiPlus: () => <span data-testid="hi-plus" />,
  HiTrash: () => <span data-testid="hi-trash" />,
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    bodyClassName,
    children,
    className,
    ...props
  }: {
    bodyClassName?: string;
    children: ReactNode;
    className?: string;
  } & React.HTMLAttributes<HTMLElement>) => (
    <section className={className} {...props}>
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

async function openProviderKeysTab() {
  fireEvent.click(screen.getByRole('tab', { name: 'Provider keys' }));
  await screen.findByText('OpenAI');
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

  it('loads hosted BYOK provider state and explains credit behavior', async () => {
    render(<SettingsApiKeysPage />);

    expect(await screen.findByText('API Keys')).toBeInTheDocument();
    expect(screen.getByText('Genfeed API keys')).toBeInTheDocument();
    expect(await screen.findByText('MCP Key')).toBeInTheDocument();
    expect(
      screen.getByText(/server-configured providers by default/),
    ).toBeInTheDocument();
    expect(screen.getByText(/no credits are deducted/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Genfeed keys' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.queryByText('OpenAI')).not.toBeInTheDocument();

    await openProviderKeysTab();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Replicate')).toBeInTheDocument();
    expect(screen.getByText('r8_****1234')).toBeInTheDocument();
    const providerRow = screen.getByTestId('provider-openai');
    expect(providerRow.firstElementChild).toHaveClass('gap-0', 'p-0');
    expect(providerRow.firstElementChild?.firstElementChild).toHaveClass(
      'min-h-12',
      'py-2',
    );

    expect(mocks.getByokAllProviders).toHaveBeenCalledWith('org-1');
    expect(mocks.findAllApiKeys).toHaveBeenCalledWith({ limit: 100 });
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

  it('disables Genfeed API key creation for free-tier organizations', async () => {
    mocks.settingsSubscriptionTier = 'free';
    render(<SettingsApiKeysPage />);

    await screen.findByText('MCP Key');
    expect(
      screen.getByText(/API access is included on paid plans/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Key' })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('MCP Server'), {
      target: { value: 'Automation MCP' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Key' }));

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

  it('validates and saves a provider key, then refreshes provider statuses', async () => {
    render(<SettingsApiKeysPage />);

    await openProviderKeysTab();
    fireEvent.click(screen.getByRole('button', { name: 'Add Key' }));
    fireEvent.change(screen.getByPlaceholderText('Enter API key...'), {
      target: { value: 'sk-test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate & Save' }));

    await waitFor(() => {
      expect(mocks.validateByokProviderKey).toHaveBeenCalledWith(
        'org-1',
        'openai',
        'sk-test',
        undefined,
      );
      expect(mocks.saveByokProviderKey).toHaveBeenCalledWith(
        'org-1',
        'openai',
        'sk-test',
        undefined,
      );
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'OpenAI API key saved',
      );
    });
  });

  it('requires provider secrets, reports invalid keys, and removes connected keys', async () => {
    render(<SettingsApiKeysPage />);

    await openProviderKeysTab();
    fireEvent.click(screen.getByRole('button', { name: 'Replace Key' }));
    expect(
      screen.getByRole('button', { name: 'Validate & Save' }),
    ).toBeDisabled();

    const secretInputs = screen.getAllByPlaceholderText(/Enter API/);
    fireEvent.change(secretInputs[0], { target: { value: 'r8-new' } });
    fireEvent.change(secretInputs[1], { target: { value: 'secret-new' } });
    mocks.validateByokProviderKey.mockResolvedValueOnce({
      error: 'Invalid replicate key',
      isValid: false,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate & Save' }));

    await waitFor(() => {
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Invalid replicate key',
      );
      expect(mocks.saveByokProviderKey).not.toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Replicate key' }),
    );

    await waitFor(() => {
      expect(mocks.removeByokProviderKey).toHaveBeenCalledWith(
        'org-1',
        'replicate',
      );
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'Replicate API key removed',
      );
    });
  });

  it('renders desktop local provider settings without waiting for organization readiness', () => {
    mocks.desktop = true;
    mocks.isReady = false;
    mocks.organizationId = '';

    render(<SettingsApiKeysPage />);

    expect(screen.getByText('Desktop providers: card')).toBeInTheDocument();
    expect(screen.getByText('API Keys')).toBeInTheDocument();
    expect(mocks.getByokAllProviders).not.toHaveBeenCalled();
  });

  it('logs provider loading and mutation failures', async () => {
    mocks.getByokAllProviders.mockRejectedValueOnce(new Error('load failed'));
    const { unmount } = render(<SettingsApiKeysPage />);

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to fetch BYOK statuses',
        expect.any(Error),
      );
    });

    unmount();
    mocks.getByokAllProviders.mockResolvedValue(providerStatuses());
    render(<SettingsApiKeysPage />);
    await openProviderKeysTab();

    mocks.removeByokProviderKey.mockRejectedValueOnce(
      new Error('remove failed'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Replicate key' }),
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to remove BYOK key',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to remove API key',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Replace Key' }));
    fireEvent.change(screen.getByPlaceholderText('Enter API key...'), {
      target: { value: 'r8-new' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter API secret...'), {
      target: { value: 'secret-new' },
    });
    mocks.validateByokProviderKey.mockRejectedValueOnce(
      new Error('save failed'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Validate & Save' }));

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to save BYOK key',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to save API key',
      );
    });
  });
});

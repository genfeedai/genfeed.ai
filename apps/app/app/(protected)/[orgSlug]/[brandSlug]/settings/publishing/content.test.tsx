import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandSettingsPublishingPage from './content';

const mocks = vi.hoisted(() => ({
  brandDetail: {
    brand: {
      agentConfig: {
        autoPublish: { confidenceThreshold: 0.92, enabled: true },
        schedule: {
          cronExpression: '0 9 * * 1-5',
          enabled: true,
          timezone: 'Europe/Malta',
        },
      },
    },
    brandId: 'brand-1',
    handleRefreshBrand: vi.fn(),
    hasBrandId: true,
    isLoading: false,
  },
  brandsService: {},
  copyToClipboard: vi.fn(),
  credentialsService: {},
  error: vi.fn(),
  getBrandsService: vi.fn(),
  getCredentialsService: vi.fn(),
  getPublishingContext: vi.fn(),
  loggerError: vi.fn(),
  success: vi.fn(),
  updateAgentConfig: vi.fn(),
}));

vi.mock('@hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => mocks.brandDetail,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const service = factory('test-token');

    return service === mocks.credentialsService
      ? mocks.getCredentialsService
      : mocks.getBrandsService;
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
      error: mocks.error,
      success: mocks.success,
    }),
  },
}));

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({
      copyToClipboard: mocks.copyToClipboard,
    }),
  },
}));

vi.mock('@services/organization/credentials.service', () => ({
  CredentialsService: {
    getInstance: () => mocks.credentialsService,
  },
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: () => mocks.brandsService,
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => <section className={className}>{children}</section>,
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div>Loading publishing settings</div>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    onClick,
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={isDisabled} type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@ui/primitives/switch', () => ({
  Switch: ({
    isChecked,
    isDisabled,
    label,
    onChange,
  }: {
    isChecked?: boolean;
    isDisabled?: boolean;
    label: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  }) => (
    <label>
      {label}
      <input
        checked={Boolean(isChecked)}
        disabled={isDisabled}
        type="checkbox"
        onChange={onChange}
      />
    </label>
  ),
}));

describe('BrandSettingsPublishingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandDetail = {
      brand: {
        agentConfig: {
          autoPublish: { confidenceThreshold: 0.92, enabled: true },
          schedule: {
            cronExpression: '0 9 * * 1-5',
            enabled: true,
            timezone: 'Europe/Malta',
          },
        },
      },
      brandId: 'brand-1',
      handleRefreshBrand: vi.fn(),
      hasBrandId: true,
      isLoading: false,
    };
    mocks.updateAgentConfig.mockResolvedValue(undefined);
    mocks.getPublishingContext.mockReset();
    Object.assign(mocks.brandsService, {
      updateAgentConfig: mocks.updateAgentConfig,
    });
    Object.assign(mocks.credentialsService, {
      getPublishingContext: mocks.getPublishingContext,
    });
    mocks.getBrandsService.mockResolvedValue({
      updateAgentConfig: mocks.updateAgentConfig,
    });
    mocks.getCredentialsService.mockResolvedValue(mocks.credentialsService);
  });

  it('loads publishing defaults and saves schedule/autopublish settings', async () => {
    render(<BrandSettingsPublishingPage />);

    expect(screen.getByText('Publishing Defaults')).toBeVisible();
    expect(screen.getByLabelText('Enable Recurring Schedule')).toBeChecked();
    expect(screen.getByDisplayValue('0 9 * * 1-5')).toBeVisible();
    expect(screen.getByDisplayValue('Europe/Malta')).toBeVisible();
    expect(screen.getByLabelText('Enable Auto-Publish')).toBeChecked();
    expect(screen.getByDisplayValue('0.92')).toBeVisible();

    fireEvent.click(screen.getByLabelText('Enable Recurring Schedule'));
    fireEvent.change(screen.getByLabelText('Cron Expression'), {
      target: { value: '0 12 * * *' },
    });
    fireEvent.change(screen.getByLabelText('Timezone'), {
      target: { value: 'UTC' },
    });
    fireEvent.click(screen.getByLabelText('Enable Auto-Publish'));
    fireEvent.change(
      screen.getByLabelText('Auto-Publish Confidence Threshold'),
      {
        target: { value: '' },
      },
    );

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mocks.updateAgentConfig).toHaveBeenCalledWith('brand-1', {
        autoPublish: {
          confidenceThreshold: undefined,
          enabled: false,
        },
        schedule: {
          cronExpression: '0 12 * * *',
          enabled: false,
          timezone: 'UTC',
        },
      });
    });
    expect(mocks.brandDetail.handleRefreshBrand).toHaveBeenCalledWith(true);
    expect(mocks.success).toHaveBeenCalledWith(
      'Brand publishing defaults saved',
    );
  });

  it('renders loading/not-found states and reports save failures', async () => {
    mocks.brandDetail = {
      ...mocks.brandDetail,
      hasBrandId: false,
      isLoading: true,
    };
    const { rerender } = render(<BrandSettingsPublishingPage />);
    expect(screen.getByText('Loading publishing settings')).toBeVisible();

    mocks.brandDetail = {
      ...mocks.brandDetail,
      brand: null,
      hasBrandId: true,
      isLoading: false,
    };
    rerender(<BrandSettingsPublishingPage />);
    expect(screen.getByText('Brand not found.')).toBeVisible();

    mocks.brandDetail = {
      ...mocks.brandDetail,
      brand: { agentConfig: {} },
      brandId: 'brand-1',
    };
    mocks.updateAgentConfig.mockRejectedValueOnce(new Error('save failed'));
    rerender(<BrandSettingsPublishingPage />);

    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to save brand publishing defaults',
        expect.any(Error),
      );
    });
    expect(mocks.error).toHaveBeenCalledWith(
      'Failed to save brand publishing defaults',
    );
  });

  it('renders publish-capable and blocked account readiness safely', async () => {
    mocks.brandDetail = {
      ...mocks.brandDetail,
      brand: {
        agentConfig: {},
        credentials: [
          {
            externalHandle: 'ready-account',
            id: 'credential-ready',
            isConnected: true,
            platform: 'twitter',
          },
          {
            externalHandle: 'blocked-account',
            id: 'credential-blocked',
            isConnected: true,
            platform: 'linkedin',
          },
        ],
      },
    };
    mocks.getPublishingContext.mockImplementation(
      async (credentialId: string) => {
        if (credentialId === 'credential-ready') {
          return {
            account: {
              handle: 'ready-account',
              id: credentialId,
              label: 'Ready account',
              platform: 'twitter',
            },
            readiness: {
              appReviewStatus: 'pass',
              callbackUrlStatus: 'pass',
              canSchedule: true,
              diagnostics: [],
              isRetryable: false,
              permissionScopeStatus: 'pass',
              providerKey: 'twitter',
              quotaStatus: 'pass',
              state: 'publish_capable',
              tokenFreshness: 'pass',
            },
            surface: 'post',
          };
        }

        return {
          account: {
            handle: 'blocked-account',
            id: credentialId,
            label: 'Blocked account',
            platform: 'linkedin',
          },
          readiness: {
            appReviewStatus: 'fail',
            callbackUrlStatus: 'pass',
            canSchedule: false,
            diagnostics: [
              {
                classification: 'missing_permission_scope',
                code: 'missing_scope',
                correctiveAction: 'Reconnect with publishing permissions.',
                details: { token: 'must-not-render-or-copy' },
                isRetryable: false,
                message:
                  'Publishing permission is missing. token=must-not-render-or-copy',
                severity: 'error',
              },
            ],
            isRetryable: false,
            permissionScopeStatus: 'fail',
            providerKey: 'linkedin',
            quotaStatus: 'unknown',
            requiredAction: 'Reconnect the LinkedIn account.',
            state: 'blocked',
            tokenFreshness: 'pass',
          },
          surface: 'post',
        };
      },
    );

    render(<BrandSettingsPublishingPage />);

    expect(await screen.findByText('Ready account')).toBeVisible();
    expect(screen.getByText('Publish Capable')).toBeVisible();
    expect(screen.getByText('Blocked account')).toBeVisible();
    expect(screen.getByText('Blocked')).toBeVisible();
    expect(screen.getByText('Reconnect the LinkedIn account.')).toBeVisible();
    expect(
      screen.queryByText('must-not-render-or-copy'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Publishing permission is missing\. token=\[REDACTED\]/),
    ).toBeVisible();

    fireEvent.click(screen.getAllByText('Copy diagnostics')[1]);

    await waitFor(() => {
      expect(mocks.copyToClipboard).toHaveBeenCalledWith(
        expect.stringContaining(
          'Publishing permission is missing. token=[REDACTED]',
        ),
      );
    });
    expect(mocks.copyToClipboard.mock.calls.at(-1)?.[0]).not.toContain(
      'must-not-render-or-copy',
    );
    expect(mocks.copyToClipboard.mock.calls.at(-1)?.[0]).toContain(
      'Token: Pass',
    );
  });

  it('renders the no-connected-account state', () => {
    mocks.brandDetail = {
      ...mocks.brandDetail,
      brand: {
        agentConfig: {},
        credentials: [],
      },
    };

    render(<BrandSettingsPublishingPage />);

    expect(
      screen.getByText('No connected accounts are available for this brand.'),
    ).toBeVisible();
    expect(mocks.getPublishingContext).not.toHaveBeenCalled();
  });

  it('preserves successful readiness when another account fails', async () => {
    mocks.brandDetail = {
      ...mocks.brandDetail,
      brand: {
        agentConfig: {},
        credentials: [
          {
            externalHandle: 'ready-account',
            id: 'credential-ready',
            isConnected: true,
            platform: 'twitter',
          },
          {
            externalHandle: 'failed-account',
            id: 'credential-failed',
            isConnected: true,
            platform: 'youtube',
          },
        ],
      },
    };
    mocks.getPublishingContext
      .mockResolvedValueOnce({
        account: {
          id: 'credential-ready',
          label: 'Ready account',
          platform: 'twitter',
        },
        readiness: {
          appReviewStatus: 'pass',
          callbackUrlStatus: 'pass',
          canSchedule: true,
          diagnostics: [],
          isRetryable: false,
          permissionScopeStatus: 'pass',
          providerKey: 'twitter',
          quotaStatus: 'pass',
          state: 'publish_capable',
          tokenFreshness: 'pass',
        },
        surface: 'post',
      })
      .mockRejectedValueOnce(new Error('network error'));

    render(<BrandSettingsPublishingPage />);

    expect(await screen.findByText('Ready account')).toBeVisible();
    expect(screen.getByText('@failed-account')).toBeVisible();
    expect(screen.getByText('Unavailable')).toBeVisible();
    expect(
      screen.getByText(
        'Publishing readiness could not be loaded for this account. Retry by refreshing this page.',
      ),
    ).toBeVisible();
  });
});

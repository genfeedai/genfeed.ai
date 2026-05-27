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
  error: vi.fn(),
  getBrandsService: vi.fn(),
  loggerError: vi.fn(),
  success: vi.fn(),
  updateAgentConfig: vi.fn(),
}));

vi.mock('@hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => mocks.brandDetail,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getBrandsService,
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

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: vi.fn(),
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
    mocks.getBrandsService.mockResolvedValue({
      updateAgentConfig: mocks.updateAgentConfig,
    });
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
});

import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsWebhooksPage from './content';

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  isReady: true,
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  organizationId: 'org-1',
  patchSettings: vi.fn(),
  testWebhookDelivery: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    isReady: mocks.isReady,
    organizationId: mocks.organizationId,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    return async () => factory('test-token');
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
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
      getSettings: mocks.getSettings,
      patchSettings: mocks.patchSettings,
      testWebhookDelivery: mocks.testWebhookDelivery,
    }),
  },
}));

describe('SettingsWebhooksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isReady = true;
  });

  it('renders both card headers immediately while settings load, then the form', async () => {
    let resolveSettings!: (value: unknown) => void;
    mocks.getSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSettings = resolve;
      }),
    );

    render(<SettingsWebhooksPage />);

    // Chrome: both card titles/descriptions render immediately.
    expect(screen.getByText('Outbound Webhook Endpoint')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Signed publish events are sent to this organization endpoint.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Delivery Status')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Latest queued or attempted delivery for this endpoint.',
      ),
    ).toBeInTheDocument();

    expect(screen.getByTestId('webhook-form-loading')).toBeInTheDocument();
    expect(screen.getByTestId('webhook-delivery-loading')).toBeInTheDocument();
    expect(screen.queryByLabelText('Endpoint URL')).not.toBeInTheDocument();

    resolveSettings({
      isWebhookEnabled: false,
      webhookDeliveryStatus: null,
      webhookEndpoint: '',
      webhookEventTypes: [],
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('webhook-form-loading'),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText('Endpoint URL')).toBeInTheDocument();
    expect(
      screen.queryByTestId('webhook-delivery-loading'),
    ).not.toBeInTheDocument();
  });
});

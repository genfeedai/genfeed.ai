import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
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

// The real hook returns a referentially stable callback; the mock must too,
// or every render re-fires the load effect and it never settles.
const getServiceStable = vi.hoisted(() => {
  let factoryRef: (token: string) => unknown;
  const getService = async () => factoryRef('test-token');
  return {
    getService,
    setFactory: (factory: (token: string) => unknown) => {
      factoryRef = factory;
    },
  };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    getServiceStable.setFactory(factory);
    return getServiceStable.getService;
  },
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
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

    render(<SettingsWebhooksPage />, { wrapper: queryClientWrapper() });

    // Chrome: both card titles render immediately.
    expect(screen.getByText('Outbound Webhook Endpoint')).toBeInTheDocument();
    expect(screen.getByText('Delivery Status')).toBeInTheDocument();

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

  it('paints the cached endpoint and delivery status at once when coming back', async () => {
    mocks.getSettings.mockResolvedValue({
      isWebhookEnabled: true,
      webhookDeliveryStatus: {
        deliveryId: 'delivery-1',
        event: 'release.published',
        status: 'delivered',
        statusCode: 200,
      },
      webhookEndpoint: 'https://hooks.example.com/genfeed',
      webhookEventTypes: ['release.published'],
    });
    const client = createTestQueryClient();
    const firstVisit = render(<SettingsWebhooksPage />, {
      wrapper: queryClientWrapper(client),
    });
    expect(await screen.findByLabelText('Endpoint URL')).toHaveValue(
      'https://hooks.example.com/genfeed',
    );
    firstVisit.unmount();

    mocks.getSettings.mockReturnValue(new Promise(() => {}));
    render(<SettingsWebhooksPage />, { wrapper: queryClientWrapper(client) });

    expect(screen.getByLabelText('Endpoint URL')).toHaveValue(
      'https://hooks.example.com/genfeed',
    );
    expect(screen.getByText('delivery-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test delivery' })).toBeEnabled();
  });
});

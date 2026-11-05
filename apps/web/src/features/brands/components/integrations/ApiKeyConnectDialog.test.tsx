import '@testing-library/jest-dom/vitest';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { ApiKeyConnectTarget } from '@props/pages/brand-integrations.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApiKeyConnectDialog from '@/features/brands/components/integrations/ApiKeyConnectDialog';

interface RecordedConnectRequest {
  body: Record<string, string>;
  servicePath: string;
}

const connectState = vi.hoisted(() => ({
  rejection: null as unknown,
  requests: [] as RecordedConnectRequest[],
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: async () => 'token' }),
}));
vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: async () => 'token',
}));
vi.mock('@services/external/services.service', () => ({
  ServicesService: class {
    constructor(private readonly servicePath: string) {}

    async postConnectWithApiKey(body: Record<string, string>) {
      connectState.requests.push({ body, servicePath: this.servicePath });
      if (connectState.rejection) {
        throw connectState.rejection;
      }
      return { id: 'credential-1' };
    }
  },
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: () => undefined, success: () => undefined }),
  },
}));

const GHOST: ApiKeyConnectTarget = {
  platform: CredentialPlatform.GHOST,
  servicePath: 'ghost',
};
const DEV_TO: ApiKeyConnectTarget = {
  platform: CredentialPlatform.DEV_TO,
  servicePath: 'devto',
};
const BEEHIIV: ApiKeyConnectTarget = {
  platform: CredentialPlatform.BEEHIIV,
  servicePath: 'beehiiv',
};

/** The JSON:API document the interceptor rethrows for a refused connect. */
function refusal(code: string) {
  return { errors: [{ code, detail: 'Refused', status: '400' }] };
}

/** Stands in for the brand card: owns `open` and shows when accounts reload. */
function Harness({ target }: { target: ApiKeyConnectTarget }) {
  const [isOpen, setIsOpen] = useState(true);
  const [hasReloaded, setHasReloaded] = useState(false);

  return (
    <>
      <ApiKeyConnectDialog
        brandId="brand-1"
        onConnected={() => setHasReloaded(true)}
        onOpenChange={setIsOpen}
        open={isOpen}
        target={target}
      />
      {hasReloaded ? <p>Accounts reloaded</p> : null}
    </>
  );
}

function fillGhostForm(url: string, key: string) {
  fireEvent.change(screen.getByLabelText(/Site URL/), {
    target: { value: url },
  });
  fireEvent.change(screen.getByLabelText(/Admin API key/), {
    target: { value: key },
  });
}

describe('ApiKeyConnectDialog', () => {
  beforeEach(() => {
    connectState.rejection = null;
    connectState.requests = [];
  });

  it('keeps Connect Ghost disabled until both the URL and key are entered', () => {
    render(<Harness target={GHOST} />);

    expect(
      screen.getByRole('button', { name: 'Connect Ghost' }),
    ).toBeDisabled();

    fillGhostForm('https://example-blog.com', 'abc123:def456');

    expect(screen.getByRole('button', { name: 'Connect Ghost' })).toBeEnabled();
  });

  it('masks the Admin API key', () => {
    render(<Harness target={GHOST} />);

    expect(screen.getByLabelText(/Admin API key/)).toHaveAttribute(
      'type',
      'password',
    );
  });

  it('sends the trimmed URL without a trailing slash, the key and the brand, closes, and reloads the accounts', async () => {
    render(<Harness target={GHOST} />);
    fillGhostForm('  https://example-blog.com/  ', ' abc123:def456 ');

    fireEvent.click(screen.getByRole('button', { name: 'Connect Ghost' }));

    expect(await screen.findByText('Accounts reloaded')).toBeInTheDocument();
    expect(connectState.requests).toEqual([
      {
        body: {
          apiKey: 'abc123:def456',
          brandId: 'brand-1',
          ghostUrl: 'https://example-blog.com',
        },
        servicePath: 'ghost',
      },
    ]);
    expect(
      screen.queryByRole('dialog', { name: 'Connect Ghost' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      'API_KEY_CONNECT_KEY_REJECTED',
      'The key was rejected. Check that you copied all of it and that it has not been revoked.',
    ],
    [
      'API_KEY_CONNECT_SITE_UNREACHABLE',
      'Could not reach that site. Check the address for typos and that the site is online.',
    ],
    [
      'API_KEY_CONNECT_HTTPS_REQUIRED',
      'Use the https:// address of your site.',
    ],
    ['API_KEY_CONNECT_UNKNOWN', 'Could not connect. Try again in a moment.'],
  ])(
    'says why when the server refuses with %s and stays open',
    async (code, message) => {
      connectState.rejection = refusal(code);
      render(<Harness target={GHOST} />);
      fillGhostForm('https://example-blog.com', 'abc123:def456');

      fireEvent.click(screen.getByRole('button', { name: 'Connect Ghost' }));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(message),
      );
      expect(
        screen.getByRole('dialog', { name: 'Connect Ghost' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Accounts reloaded')).not.toBeInTheDocument();
    },
  );

  it('falls back to the generic message when the request fails without a reason', async () => {
    connectState.rejection = new Error('Network error');
    render(<Harness target={GHOST} />);
    fillGhostForm('https://example-blog.com', 'abc123:def456');

    fireEvent.click(screen.getByRole('button', { name: 'Connect Ghost' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not connect. Try again in a moment.',
      ),
    );
  });

  it('connects dev.to with the key alone', async () => {
    render(<Harness target={DEV_TO} />);

    expect(screen.queryByLabelText(/Site URL/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/API key/), {
      target: { value: ' devto-key ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect dev.to' }));

    expect(await screen.findByText('Accounts reloaded')).toBeInTheDocument();
    expect(connectState.requests).toEqual([
      {
        body: { apiKey: 'devto-key', brandId: 'brand-1' },
        servicePath: 'devto',
      },
    ]);
  });

  it.each([
    ['', { apiKey: 'beehiiv-key', brandId: 'brand-1' }],
    [
      ' pub_123 ',
      { apiKey: 'beehiiv-key', brandId: 'brand-1', publicationId: 'pub_123' },
    ],
  ])('connects Beehiiv with publication id %j', async (publicationId, body) => {
    render(<Harness target={BEEHIIV} />);

    fireEvent.change(screen.getByLabelText(/^API key/), {
      target: { value: 'beehiiv-key' },
    });
    fireEvent.change(screen.getByLabelText(/Publication ID/), {
      target: { value: publicationId },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect Beehiiv' }));

    expect(await screen.findByText('Accounts reloaded')).toBeInTheDocument();
    expect(connectState.requests).toEqual([{ body, servicePath: 'beehiiv' }]);
  });

  it.each([
    [
      'Ghost',
      { ...GHOST, reconnectExternalId: 'https://example-blog.com' },
      /Site URL/,
      'https://example-blog.com',
    ],
    [
      'Beehiiv',
      { ...BEEHIIV, reconnectExternalId: 'pub_456' },
      /Publication ID/,
      'pub_456',
    ],
  ])(
    'fills in the %s account being reconnected',
    (_platform, target, label, value) => {
      render(<Harness target={target} />);

      expect(screen.getByLabelText(label)).toHaveValue(value);
    },
  );

  it('accepts a site address typed without https://', () => {
    render(<Harness target={GHOST} />);

    expect(screen.getByLabelText(/Site URL/)).toHaveAttribute('type', 'text');
  });
});

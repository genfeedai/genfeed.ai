import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GhostConnectDialog from '@/features/brands/components/integrations/GhostConnectDialog';

interface RecordedConnectRequest {
  apiKey: string;
  brandId: string;
  ghostUrl: string;
}

const connectState = vi.hoisted(() => ({
  isRejecting: false,
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
    async postConnectWithApiKey(body: RecordedConnectRequest) {
      connectState.requests.push(body);
      if (connectState.isRejecting) {
        throw new Error('401');
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

/** Stands in for the brand card: owns `open` and shows when accounts reload. */
function Harness() {
  const [isOpen, setIsOpen] = useState(true);
  const [hasReloaded, setHasReloaded] = useState(false);

  return (
    <>
      <GhostConnectDialog
        brandId="brand-1"
        onConnected={() => setHasReloaded(true)}
        onOpenChange={setIsOpen}
        open={isOpen}
      />
      {hasReloaded ? <p>Accounts reloaded</p> : null}
    </>
  );
}

function fillForm(url: string, key: string) {
  fireEvent.change(screen.getByLabelText(/Site URL/), {
    target: { value: url },
  });
  fireEvent.change(screen.getByLabelText(/Admin API key/), {
    target: { value: key },
  });
}

describe('GhostConnectDialog', () => {
  beforeEach(() => {
    connectState.isRejecting = false;
    connectState.requests = [];
  });

  it('keeps Connect Ghost disabled until both the URL and key are entered', () => {
    render(<Harness />);

    expect(
      screen.getByRole('button', { name: 'Connect Ghost' }),
    ).toBeDisabled();

    fillForm('https://example-blog.com', 'abc123:def456');

    expect(screen.getByRole('button', { name: 'Connect Ghost' })).toBeEnabled();
  });

  it('masks the Admin API key', () => {
    render(<Harness />);

    expect(screen.getByLabelText(/Admin API key/)).toHaveAttribute(
      'type',
      'password',
    );
  });

  it('sends the trimmed URL without a trailing slash, the key and the brand, closes, and reloads the accounts', async () => {
    render(<Harness />);
    fillForm('  https://example-blog.com/  ', ' abc123:def456 ');

    fireEvent.click(screen.getByRole('button', { name: 'Connect Ghost' }));

    expect(await screen.findByText('Accounts reloaded')).toBeInTheDocument();
    expect(connectState.requests).toEqual([
      {
        apiKey: 'abc123:def456',
        brandId: 'brand-1',
        ghostUrl: 'https://example-blog.com',
      },
    ]);
    expect(
      screen.queryByRole('dialog', { name: 'Connect Ghost' }),
    ).not.toBeInTheDocument();
  });

  it('shows an error and stays open when the key is rejected', async () => {
    connectState.isRejecting = true;
    render(<Harness />);
    fillForm('https://example-blog.com', 'wrong:key');

    fireEvent.click(screen.getByRole('button', { name: 'Connect Ghost' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not connect Ghost. Check the site URL and Admin API key.',
      ),
    );
    expect(
      screen.getByRole('dialog', { name: 'Connect Ghost' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Accounts reloaded')).not.toBeInTheDocument();
  });
});

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GhostConnectDialog from '@/features/brands/components/integrations/GhostConnectDialog';

const { postConnectWithApiKey } = vi.hoisted(() => ({
  postConnectWithApiKey: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn(async () => 'token') }),
}));
vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn(async () => 'token'),
}));
vi.mock('@services/external/services.service', () => ({
  ServicesService: class {
    postConnectWithApiKey = postConnectWithApiKey;
  },
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));

function renderDialog(overrides: { onConnected?: () => void } = {}) {
  const onConnected = overrides.onConnected ?? vi.fn();
  const onOpenChange = vi.fn();
  render(
    <GhostConnectDialog
      brandId="brand-1"
      onConnected={onConnected}
      onOpenChange={onOpenChange}
      open
    />,
  );
  return { onConnected, onOpenChange };
}

function fillForm() {
  fireEvent.change(screen.getByLabelText(/Site URL/), {
    target: { value: 'https://example-blog.com' },
  });
  fireEvent.change(screen.getByLabelText(/Admin API key/), {
    target: { value: 'abc123:def456' },
  });
}

describe('GhostConnectDialog', () => {
  beforeEach(() => {
    postConnectWithApiKey.mockReset();
    postConnectWithApiKey.mockResolvedValue({ id: 'credential-1' });
  });

  it('keeps Connect Ghost disabled until both the URL and key are entered', () => {
    renderDialog();

    expect(
      screen.getByRole('button', { name: 'Connect Ghost' }),
    ).toBeDisabled();

    fillForm();

    expect(screen.getByRole('button', { name: 'Connect Ghost' })).toBeEnabled();
  });

  it('masks the Admin API key', () => {
    renderDialog();

    expect(screen.getByLabelText(/Admin API key/)).toHaveAttribute(
      'type',
      'password',
    );
  });

  it('sends the trimmed URL, key and brand, then reports the connection', async () => {
    const { onConnected, onOpenChange } = renderDialog();
    fireEvent.change(screen.getByLabelText(/Site URL/), {
      target: { value: '  https://example-blog.com  ' },
    });
    fireEvent.change(screen.getByLabelText(/Admin API key/), {
      target: { value: ' abc123:def456 ' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Connect Ghost' }));

    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
    expect(postConnectWithApiKey).toHaveBeenCalledWith({
      apiKey: 'abc123:def456',
      brandId: 'brand-1',
      ghostUrl: 'https://example-blog.com',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows an error and stays open when the key is rejected', async () => {
    postConnectWithApiKey.mockRejectedValue(new Error('401'));
    const { onConnected, onOpenChange } = renderDialog();
    fillForm();

    fireEvent.click(screen.getByRole('button', { name: 'Connect Ghost' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not connect Ghost. Check the site URL and Admin API key.',
    );
    expect(onConnected).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

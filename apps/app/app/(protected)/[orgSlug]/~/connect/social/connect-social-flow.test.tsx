import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConnectSocialFlow from './connect-social-flow';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  orgHref: vi.fn((path: string) => `/acme/~${path}`),
  postConnect: vi.fn(),
  searchParams: new URLSearchParams(
    'platform=twitter&brandId=brand-2&connectionId=cred-1',
  ),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: mocks.getToken }),
}));
vi.mock('@hooks/navigation/use-org-url/use-org-url', () => ({
  useOrgUrl: () => ({ orgHref: mocks.orgHref }),
}));
vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn(async () => 'token'),
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ error: vi.fn() }) },
}));
vi.mock('@services/external/services.service', () => ({
  ServicesService: class {
    postConnect = mocks.postConnect;
  },
}));
vi.mock('@ui/constants/oauth-connect-platforms', () => ({
  resolveOAuthServicePath: () => 'twitter',
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('ConnectSocialFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.postConnect.mockResolvedValue({
      url: 'https://twitter.com/i/oauth2/authorize',
    });
    vi.stubGlobal('open', vi.fn());
  });

  it('resumes the pending connection id instead of creating a disconnected start', async () => {
    render(<ConnectSocialFlow />);
    await userEvent.click(screen.getByRole('button', { name: 'authorize' }));

    expect(mocks.postConnect).toHaveBeenCalledWith({
      brandId: 'brand-2',
      credentialId: 'cred-1',
    });
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('https://twitter.com/i/oauth2/authorize'),
      '_self',
    );
  });
});

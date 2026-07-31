import '@testing-library/jest-dom/vitest';
import { CredentialPlatform } from '@genfeedai/enums';
import type {
  ICredential,
  IPublishingProviderReadiness,
} from '@genfeedai/interfaces';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CrossPostComposerPage from './cross-post-composer-page';

const useBrandMock = vi.fn();

const mocks = vi.hoisted(() => {
  const listBrandPublishingReadiness = vi.fn();

  return {
    // Identity has to be stable across renders: the real hook memoizes it, and
    // the readiness effect keys on it. A fresh function per render would loop.
    getCredentialsService: vi.fn(async () => ({
      listBrandPublishingReadiness,
    })),
    listBrandPublishingReadiness,
    loggerError: vi.fn(),
  };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getCredentialsService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/organization/credentials.service', () => ({
  CredentialsService: {
    getInstance: () => ({
      listBrandPublishingReadiness: mocks.listBrandPublishingReadiness,
    }),
  },
}));

function readiness(
  overrides: Partial<IPublishingProviderReadiness> & { credentialId: string },
): IPublishingProviderReadiness {
  return {
    appReviewStatus: 'pass',
    callbackUrlStatus: 'pass',
    canSchedule: true,
    diagnostics: [],
    isRetryable: false,
    permissionScopeStatus: 'unknown',
    providerKey: CredentialPlatform.TWITTER,
    quotaStatus: 'unknown',
    state: 'publish_capable',
    tokenFreshness: 'pass',
    ...overrides,
  };
}

function credential(
  overrides: Partial<ICredential> & {
    id: string;
    platform: CredentialPlatform;
  },
): ICredential {
  return {
    accessTokenExpiry: undefined,
    accountHealth: undefined,
    brand: 'brand-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    description: undefined,
    externalHandle: overrides.externalHandle ?? overrides.id,
    externalId: overrides.externalId ?? overrides.id,
    externalUrl: undefined,
    id: overrides.id,
    isConnected: overrides.isConnected ?? true,
    label: overrides.label,
    organization: {} as ICredential['organization'],
    platform: overrides.platform,
    tags: [],
    token: '',
    tokenExpiry: undefined,
    updatedAt: '2026-01-01T00:00:00.000Z',
    user: {} as ICredential['user'],
    ...overrides,
  };
}

describe('CrossPostComposerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listBrandPublishingReadiness.mockResolvedValue([]);
    useBrandMock.mockReturnValue({ credentials: [] });
  });

  it('renders an empty channel state without connected credentials', () => {
    render(<CrossPostComposerPage />);

    expect(
      screen.getByText('No connected publishing channels available.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Select at least one channel target to review scheduling readiness.',
      ),
    ).toBeInTheDocument();
  });

  it('preserves per-target caption overrides while switching targets', () => {
    useBrandMock.mockReturnValue({
      credentials: [
        credential({
          externalHandle: 'launch_x',
          id: 'cred-x',
          platform: CredentialPlatform.TWITTER,
        }),
        credential({
          externalHandle: 'company',
          id: 'cred-linkedin',
          platform: CredentialPlatform.LINKEDIN,
        }),
      ],
    });

    render(<CrossPostComposerPage />);

    fireEvent.change(screen.getByLabelText('Release title'), {
      target: { value: 'Launch release' },
    });
    fireEvent.change(screen.getByLabelText('Base content'), {
      target: { value: 'Base launch copy' },
    });
    fireEvent.change(screen.getByLabelText('Schedule date'), {
      target: { value: '2026-07-15T09:30' },
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /x .*launch_x/i }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: /linkedin .*company/i }),
    );

    fireEvent.click(screen.getByRole('button', { name: /edit x .*launch_x/i }));
    fireEvent.change(screen.getByLabelText('Target caption'), {
      target: { value: 'X variant copy' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /edit linkedin .*company/i }),
    );
    fireEvent.change(screen.getByLabelText('Target caption'), {
      target: { value: 'LinkedIn variant copy' },
    });

    fireEvent.click(screen.getByRole('button', { name: /edit x .*launch_x/i }));

    expect(screen.getByLabelText('Target caption')).toHaveValue(
      'X variant copy',
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('shows exact target blocking reasons before submit', () => {
    useBrandMock.mockReturnValue({
      credentials: [
        credential({
          externalHandle: 'studio',
          id: 'cred-youtube',
          platform: CredentialPlatform.YOUTUBE,
        }),
      ],
    });

    render(<CrossPostComposerPage />);

    fireEvent.click(
      screen.getByRole('checkbox', { name: /youtube .*studio/i }),
    );

    // Scoped to the review column: the preview panel repeats a subset of these
    // messages for the active target, so an unscoped query matches twice.
    const blockers = within(
      screen.getByRole('list', { name: 'YouTube @studio blockers' }),
    );
    expect(
      blockers.getByText('Release content is required for YouTube.'),
    ).toBeInTheDocument();
    expect(
      blockers.getByText('Schedule date is required for YouTube.'),
    ).toBeInTheDocument();
    expect(
      blockers.getByText('YouTube requires at least 1 media item(s).'),
    ).toBeInTheDocument();
  });

  it('previews the active target through the platform renderer registry', () => {
    useBrandMock.mockReturnValue({
      credentials: [
        credential({
          externalHandle: 'launch_x',
          id: 'cred-x',
          platform: CredentialPlatform.TWITTER,
        }),
        credential({
          externalHandle: 'company',
          id: 'cred-linkedin',
          platform: CredentialPlatform.LINKEDIN,
        }),
      ],
    });

    render(<CrossPostComposerPage />);

    fireEvent.change(screen.getByLabelText('Base content'), {
      target: { value: 'Base launch copy' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /x .*launch_x/i }));

    expect(
      screen.getByRole('article', { name: 'X (Twitter) platform preview' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Base launch copy').length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole('checkbox', { name: /linkedin .*company/i }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /edit linkedin .*company/i }),
    );
    fireEvent.change(screen.getByLabelText('Target caption'), {
      target: { value: 'LinkedIn variant copy' },
    });

    // The preview follows the active target and its caption override.
    expect(
      screen.getByRole('article', { name: 'LinkedIn platform preview' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('article', { name: 'X (Twitter) platform preview' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('LinkedIn variant copy').length).toBeGreaterThan(
      0,
    );
  });

  describe('channel publishing readiness', () => {
    const connectedX = credential({
      externalHandle: 'launch_x',
      id: 'cred-x',
      platform: CredentialPlatform.TWITTER,
    });

    it('blocks a channel on its own required action, not a generic disconnect notice', async () => {
      useBrandMock.mockReturnValue({
        brandId: 'brand-1',
        credentials: [connectedX],
      });
      mocks.listBrandPublishingReadiness.mockResolvedValue([
        readiness({
          canSchedule: false,
          credentialId: 'cred-x',
          requiredAction:
            'Register a X (Twitter) developer app and set TWITTER_CLIENT_ID.',
          state: 'blocked',
        }),
      ]);

      render(<CrossPostComposerPage />);

      await waitFor(() => {
        expect(mocks.listBrandPublishingReadiness).toHaveBeenCalledWith(
          'brand-1',
          expect.any(AbortSignal),
        );
      });
      await waitFor(() => {
        expect(
          screen.getByRole('checkbox', { name: /launch_x/i }),
        ).toBeDisabled();
      });
      // The credential is connected — only the deployment is broken, so the
      // copy must point at the deployment rather than at reconnecting.
      expect(
        screen.getByText(
          'Register a X (Twitter) developer app and set TWITTER_CLIENT_ID.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Reconnect before scheduling'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Not publishable')).toBeInTheDocument();
    });

    it('states why an already-selected target cannot ship once readiness lands', async () => {
      let resolveReadiness: (records: IPublishingProviderReadiness[]) => void =
        () => undefined;
      useBrandMock.mockReturnValue({
        brandId: 'brand-1',
        credentials: [connectedX],
      });
      mocks.listBrandPublishingReadiness.mockReturnValue(
        new Promise<IPublishingProviderReadiness[]>((resolve) => {
          resolveReadiness = resolve;
        }),
      );

      render(<CrossPostComposerPage />);

      // Readiness is still in flight, so the target is selectable on the
      // `isConnected` flag alone — the review must revise itself afterwards.
      fireEvent.click(screen.getByRole('checkbox', { name: /launch_x/i }));

      resolveReadiness([
        readiness({
          canSchedule: false,
          credentialId: 'cred-x',
          requiredAction: 'Reconnect the provider account before publishing.',
          state: 'blocked',
        }),
      ]);

      expect(
        await screen.findByText(
          /@launch_x: Reconnect the provider account before publishing\./,
        ),
      ).toBeInTheDocument();
    });

    it('falls back to the connection flag when readiness cannot be loaded', async () => {
      useBrandMock.mockReturnValue({
        brandId: 'brand-1',
        credentials: [
          connectedX,
          credential({
            externalHandle: 'stale_page',
            id: 'cred-linkedin',
            isConnected: false,
            platform: CredentialPlatform.LINKEDIN,
          }),
        ],
      });
      mocks.listBrandPublishingReadiness.mockRejectedValue(
        new Error('readiness unavailable'),
      );

      render(<CrossPostComposerPage />);

      await waitFor(() => {
        expect(mocks.loggerError).toHaveBeenCalledWith(
          'Failed to load channel publishing readiness',
          expect.any(Error),
        );
      });
      // Authoring stays available: a failed enhancement must not gate the page.
      expect(screen.getByRole('checkbox', { name: /launch_x/i })).toBeEnabled();
      expect(
        screen.getByRole('checkbox', { name: /stale_page/i }),
      ).toBeDisabled();
      expect(
        screen.getByText('Reconnect before scheduling'),
      ).toBeInTheDocument();
    });
  });
});

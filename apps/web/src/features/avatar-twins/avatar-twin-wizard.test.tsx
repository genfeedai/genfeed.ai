// @vitest-environment jsdom

import { queryClientWrapper } from '@app-tests/query-client.harness';
import { AvatarTwinStatus } from '@genfeedai/contracts';
import type { IAvatarTwin } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AvatarTwinWizard from '@/features/avatar-twins/avatar-twin-wizard';

const api = vi.hoisted(() => ({
  connection: { state: 'connected' as string },
  twins: [] as Partial<IAvatarTwin>[],
  refreshed: null as Partial<IAvatarTwin> | null,
  consentUrl: 'https://app.heygen.com/consent/abc',
  brandConfig: {} as Record<string, unknown>,
  brandUpdates: [] as unknown[],
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({ brandId: 'brand-1' }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    refreshBrands: async () => undefined,
    selectedBrand: { agentConfig: api.brandConfig, id: 'brand-1' },
  }),
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: () => ({
      updateAgentConfig: async (id: string, data: Record<string, unknown>) => {
        api.brandUpdates.push({ data, id });
      },
    }),
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', async () => {
  const { useCallback } = await import('react');
  return {
    useAuthedService: (factory: (token: string) => unknown) =>
      useCallback(async () => factory('token'), []),
  };
});

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/main${path}`,
    orgHref: (path: string) => `/acme${path}`,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/main/library/avatars/twin',
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children, label }: { children: ReactNode; label: string }) => (
    <section>
      <h1>{label}</h1>
      {children}
    </section>
  ),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useConfirmModal: () => ({
      closeConfirm: vi.fn(),
      openConfirm: ({ onConfirm }: { onConfirm: () => void }) => onConfirm(),
    }),
  }),
);

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/ingredients/heygen.service', () => ({
  HeyGenService: {
    getInstance: () => ({
      fetchConnectionStatus: async () => ({
        hasCustomKey: api.connection.state !== 'disconnected',
        isConnected: api.connection.state === 'connected',
        provider: 'heygen',
        state: api.connection.state,
      }),
    }),
  },
}));

vi.mock('@services/ingredients/avatar-twins.service', () => ({
  AvatarTwinsService: {
    getInstance: () => ({
      get: async (id: string) =>
        api.refreshed ?? api.twins.find((twin) => twin.id === id),
      list: async () => api.twins,
      remove: async (id: string) => {
        api.twins = api.twins.filter((twin) => twin.id !== id);
        return {};
      },
      requestConsentLink: async () => ({
        consentUrl: api.consentUrl,
        expiresAt: '2026-11-09T12:00:00.000Z',
      }),
    }),
  },
}));

vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: { getInstance: () => ({}) },
}));

function twin(overrides: Partial<IAvatarTwin>): Partial<IAvatarTwin> {
  return {
    consentLinkExpiresAt: null,
    failureMessage: null,
    id: 'twin-1',
    name: 'My digital twin',
    providerGroupId: 'grp_1',
    providerLookId: 'look_1',
    voiceId: 'voice_1',
    previewImageUrl: null,
    status: AvatarTwinStatus.TRAINING,
    ...overrides,
  };
}

function renderWizard() {
  return render(<AvatarTwinWizard />, { wrapper: queryClientWrapper() });
}

describe('AvatarTwinWizard', () => {
  beforeEach(() => {
    api.connection.state = 'connected';
    api.twins = [];
    api.refreshed = null;
    api.brandConfig = {};
    api.brandUpdates = [];
  });

  it('asks for the person’s own HeyGen account before anything else', async () => {
    api.connection.state = 'disconnected';
    renderWizard();

    expect(
      await screen.findByRole('heading', {
        name: 'Connect your HeyGen account',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Integrations' }),
    ).toHaveAttribute('href', '/acme/settings/integrations');
    expect(
      screen.queryByRole('button', { name: 'Turn on camera' }),
    ).not.toBeInTheDocument();
  });

  it('says when the saved key is rejected', async () => {
    api.connection.state = 'invalid';
    renderWizard();

    expect(
      await screen.findByText(/HeyGen rejected the saved API key/),
    ).toBeInTheDocument();
  });

  it('starts at the recorder with a script to read', async () => {
    renderWizard();

    expect(
      await screen.findByRole('button', { name: 'Turn on camera' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Read this' })).toHaveTextContent(
      /digital twin can speak just like me/,
    );
  });

  it('shows the provider’s current state, not the stored one', async () => {
    api.twins = [twin({ status: AvatarTwinStatus.TRAINING })];
    api.refreshed = twin({ status: AvatarTwinStatus.AWAITING_CONSENT });
    renderWizard();

    expect(
      await screen.findByText(/Training is done\. HeyGen needs your consent/),
    ).toBeInTheDocument();
  });

  it('opens the consent page in a new tab', async () => {
    api.twins = [twin({ status: AvatarTwinStatus.AWAITING_CONSENT })];
    const tab = { close: vi.fn(), location: { href: '' }, opener: {} };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    renderWizard();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Record consent on HeyGen' }),
    );

    await waitFor(() => expect(tab.location.href).toBe(api.consentUrl));
    expect(tab.opener).toBeNull();
    expect(
      await screen.findByText(/Waiting for HeyGen to confirm your consent/),
    ).toBeInTheDocument();
  });

  it('lets the person record a new take after consent is rejected', async () => {
    api.twins = [
      twin({
        failureMessage: 'Say the statement on camera.',
        status: AvatarTwinStatus.CONSENT_REJECTED,
      }),
    ];
    renderWizard();

    expect(
      await screen.findByText('Reason: Say the statement on camera.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Get a new consent link' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Record a new take' }));

    expect(
      await screen.findByRole('button', { name: 'Turn on camera' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('links back to the avatars once the twin is ready', async () => {
    api.twins = [twin({ status: AvatarTwinStatus.READY })];
    renderWizard();

    expect(await screen.findByText('Your twin is ready.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to Avatars' }),
    ).toHaveAttribute('href', '/acme/main/library/avatars');
  });

  it('returns to the recorder after the twin is deleted', async () => {
    api.twins = [twin({ status: AvatarTwinStatus.READY })];
    renderWizard();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete twin' }));

    expect(
      await screen.findByRole('button', { name: 'Turn on camera' }),
    ).toBeInTheDocument();
  });
  it('makes a ready twin the brand’s avatar and voice', async () => {
    api.twins = [twin({ status: AvatarTwinStatus.READY })];
    renderWizard();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Use for this brand' }),
    );

    await waitFor(() =>
      expect(api.brandUpdates).toEqual([
        {
          data: {
            defaultAvatarIngredientId: null,
            defaultAvatarRef: {
              groupId: 'grp_1',
              lookId: 'look_1',
              ownership: 'private',
              source: 'heygen-look',
            },
            defaultVoiceId: null,
            defaultVoiceRef: {
              externalVoiceId: 'voice_1',
              label: 'My digital twin',
              ownership: 'private',
              provider: 'HEYGEN',
              source: 'catalog',
            },
          },
          id: 'brand-1',
        },
      ]),
    );
  });

  it('can keep the brand’s current voice', async () => {
    api.brandConfig = { defaultVoiceRef: { source: 'cloned' } };
    api.twins = [twin({ status: AvatarTwinStatus.READY })];
    renderWizard();

    fireEvent.click(
      await screen.findByRole('radio', {
        name: "Keep the brand's current voice",
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use for this brand' }));

    await waitFor(() =>
      expect(api.brandUpdates).toEqual([
        {
          data: {
            defaultAvatarIngredientId: null,
            defaultAvatarRef: {
              groupId: 'grp_1',
              lookId: 'look_1',
              ownership: 'private',
              source: 'heygen-look',
            },
          },
          id: 'brand-1',
        },
      ]),
    );
  });

  it('says when the brand already uses the twin', async () => {
    api.brandConfig = { defaultAvatarRef: { lookId: 'look_1' } };
    api.twins = [twin({ status: AvatarTwinStatus.READY })];
    renderWizard();

    expect(
      await screen.findByText(
        'This brand uses your twin as its default avatar.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Use for this brand' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Make a video' })).toHaveAttribute(
      'href',
      '/acme/main/playground',
    );
  });
});

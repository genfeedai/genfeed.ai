import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationIdentityDefaultsCard from './organization-identity-defaults-card';

const mocks = vi.hoisted(() => ({
  avatars: [
    {
      id: 'avatar-1',
      ingredientUrl: 'https://example.test/avatar.png',
      metadataLabel: 'Founder Avatar',
    },
    {
      id: 'avatar-2',
      metadataLabel: 'Operator Avatar',
    },
  ],
  brandSlug: 'brand-one',
  getOrganizationsService: vi.fn(),
  isLoadingAvatars: false,
  isLoadingCatalog: false,
  loggerError: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  organizationId: 'org-1',
  patchSettings: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  settings: {
    defaultAvatarIngredientId: 'avatar-1',
    defaultVoiceId: 'voice-1',
  } as Record<string, unknown>,
  voices: [
    {
      externalVoiceId: 'external-1',
      id: 'voice-1',
      metadataLabel: 'Narrator',
      provider: 'elevenlabs',
    },
    {
      externalVoiceId: 'external-2',
      id: 'voice-2',
      metadataLabel: 'Host',
      provider: 'openai',
    },
  ],
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    organizationId: mocks.organizationId,
  }),
}));

vi.mock('@helpers/voice/default-voice-ref.helper', () => ({
  buildDefaultVoiceRefFromVoice: (
    voice: { id?: string; provider?: string } | null,
  ) => (voice ? { id: voice.id, provider: voice.provider } : null),
  matchesDefaultVoice: (
    settings: { defaultVoiceId?: string },
    voice: { id: string },
  ) => settings.defaultVoiceId === voice.id,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getOrganizationsService,
}));

vi.mock('@hooks/data/ingredients/use-avatar-images/use-avatar-images', () => ({
  useAvatarImages: () => ({
    avatars: mocks.avatars,
    isLoading: mocks.isLoadingAvatars,
  }),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => ({
    refresh: mocks.refresh,
    settings: mocks.settings,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    brandSlug: mocks.brandSlug,
    href: (path: string) => `/org/brand${path}`,
    orgHref: (path: string) => `/org${path}`,
  }),
}));

vi.mock('@pages/library/voices/hooks/use-voice-catalog', () => ({
  useVoiceCatalog: () => ({
    isLoading: mocks.isLoadingCatalog,
    voices: mocks.voices,
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
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
      patchSettings: mocks.patchSettings,
    }),
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    className,
    'data-testid': testId,
  }: {
    children: ReactNode;
    className?: string;
    'data-testid'?: string;
  }) => (
    <section className={className} data-testid={testId}>
      {children}
    </section>
  ),
}));

vi.mock('@ui/display/selected-avatar-preview/SelectedAvatarPreview', () => ({
  default: ({ imageAlt, title }: { imageAlt: string; title: string }) => (
    <figure>
      <div aria-label={imageAlt} role="img" />
      <figcaption>{title}</figcaption>
    </figure>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    onClick,
    type = 'button',
  }: {
    children: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button type={type} disabled={isDisabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    disabled,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onValueChange: (value: string) => void;
    value: string;
  }) => (
    <select
      disabled={disabled}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

vi.mock('@utils/media/ingredient-type.util', () => ({
  getIngredientDisplayLabel: (ingredient?: { metadataLabel?: string } | null) =>
    ingredient?.metadataLabel ?? '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

describe('OrganizationIdentityDefaultsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.avatars = [
      {
        id: 'avatar-1',
        ingredientUrl: 'https://example.test/avatar.png',
        metadataLabel: 'Founder Avatar',
      },
      {
        id: 'avatar-2',
        metadataLabel: 'Operator Avatar',
      },
    ];
    mocks.brandSlug = 'brand-one';
    mocks.isLoadingAvatars = false;
    mocks.isLoadingCatalog = false;
    mocks.organizationId = 'org-1';
    mocks.settings = {
      defaultAvatarIngredientId: 'avatar-1',
      defaultVoiceId: 'voice-1',
    };
    mocks.voices = [
      {
        externalVoiceId: 'external-1',
        id: 'voice-1',
        metadataLabel: 'Narrator',
        provider: 'elevenlabs',
      },
      {
        externalVoiceId: 'external-2',
        id: 'voice-2',
        metadataLabel: 'Host',
        provider: 'openai',
      },
    ];
    mocks.getOrganizationsService.mockResolvedValue({
      patchSettings: mocks.patchSettings,
    });
    mocks.patchSettings.mockResolvedValue({});
    mocks.refresh.mockResolvedValue(undefined);
  });

  it('renders current avatar and voice defaults with library navigation', () => {
    render(<OrganizationIdentityDefaultsCard />);

    expect(
      screen.getByTestId('org-identity-defaults-card'),
    ).toBeInTheDocument();
    expect(screen.getByText('Organization Identity')).toBeInTheDocument();
    expect(screen.getAllByText('Founder Avatar').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        /Current avatar: Founder Avatar\. Current voice: Narrator/,
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Browse Avatar Library' }),
    );
    expect(mocks.push).toHaveBeenCalledWith('/org/brand/library/avatars');
    fireEvent.click(
      screen.getByRole('button', { name: 'Browse Voice Library' }),
    );
    expect(mocks.push).toHaveBeenCalledWith('/org/brand/library/voices');
  });

  it('saves selected avatar and voice defaults', async () => {
    render(<OrganizationIdentityDefaultsCard />);

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'avatar-2' } });
    fireEvent.change(selects[1], { target: { value: 'voice-2' } });

    fireEvent.click(
      screen.getByRole('button', { name: 'Save Organization Identity' }),
    );

    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledWith('org-1', {
        defaultAvatarIngredientId: 'avatar-2',
        defaultVoiceId: 'voice-2',
        defaultVoiceProvider: 'openai',
        defaultVoiceRef: { id: 'voice-2', provider: 'openai' },
      });
      expect(mocks.refresh).toHaveBeenCalled();
      expect(mocks.notificationsSuccess).toHaveBeenCalledWith(
        'Organization identity defaults saved',
      );
    });
  });

  it('clears defaults and routes organization-level users to brand selection', async () => {
    mocks.brandSlug = '';
    render(<OrganizationIdentityDefaultsCard />);

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'none' } });
    fireEvent.change(selects[1], { target: { value: 'none' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Organization Identity' }),
    );

    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledWith('org-1', {
        defaultAvatarIngredientId: null,
        defaultVoiceId: null,
        defaultVoiceProvider: null,
        defaultVoiceRef: null,
      });
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Select a Brand to Browse Avatars' }),
    );
    expect(mocks.push).toHaveBeenCalledWith('/org/settings/brands');
  });

  it('renders empty/loading states and reports save failures', async () => {
    mocks.avatars = [];
    mocks.isLoadingCatalog = true;
    mocks.settings = {};
    const { rerender } = render(<OrganizationIdentityDefaultsCard />);

    expect(
      screen.getByText(/No avatar ingredients are available yet/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')[1]).toBeDisabled();
    expect(
      screen.getByText(
        /Current avatar: No default\. Current voice: No organization default voice/,
      ),
    ).toBeInTheDocument();

    mocks.organizationId = '';
    rerender(<OrganizationIdentityDefaultsCard />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Organization Identity' }),
    );
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Organization context is unavailable',
    );

    mocks.organizationId = 'org-1';
    mocks.patchSettings.mockRejectedValueOnce(new Error('save failed'));
    rerender(<OrganizationIdentityDefaultsCard />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Organization Identity' }),
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to save organization identity defaults',
        expect.any(Error),
      );
      expect(mocks.notificationsError).toHaveBeenCalledWith(
        'Failed to save organization identity defaults',
      );
    });
  });
});

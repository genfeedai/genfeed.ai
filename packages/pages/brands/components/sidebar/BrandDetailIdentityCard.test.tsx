// @vitest-environment jsdom

import type { Voice } from '@models/ingredients/voice.model';
import BrandDetailIdentityCard from '@pages/brands/components/sidebar/BrandDetailIdentityCard';
import type { BrandDetailIdentityCardProps } from '@props/pages/brand-detail.props';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseBrand = vi.fn();
const mockUseOrganization = vi.fn();
const mockUseAvatarImages = vi.fn();
const mockUseVoiceCatalog = vi.fn();
const mockPush = vi.fn();

const {
  loggerErrorMock,
  notifyErrorMock,
  notifySuccessMock,
  updateAgentConfigMock,
} = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  updateAgentConfigMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mockUseBrand(),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => mockUseOrganization(),
}));

vi.mock('@hooks/data/ingredients/use-avatar-images/use-avatar-images', () => ({
  useAvatarImages: () => mockUseAvatarImages(),
}));

vi.mock('@pages/library/voices/hooks/use-voice-catalog', () => ({
  useVoiceCatalog: () => mockUseVoiceCatalog(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    updateAgentConfig: updateAgentConfigMock,
  }),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: notifyErrorMock,
      success: notifySuccessMock,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: loggerErrorMock,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@ui/audio/preview-player/AudioPreviewPlayer', () => ({
  default: ({
    audioUrl,
    label,
  }: {
    audioUrl?: string | null;
    label: string;
  }) => <div>{`${label}:${audioUrl ?? 'no-preview'}`}</div>,
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children, ...props }: { children: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    children,
    onClick,
    ...props
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button onClick={onClick} type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/display/selected-avatar-preview/SelectedAvatarPreview', () => ({
  default: () => <div>Selected Avatar Preview</div>,
}));

// Radix Select needs pointer APIs jsdom lacks; this stub keeps the value
// contract (onValueChange fires with the picked item's value) without them.
vi.mock('@ui/primitives/select', async () => {
  const { createContext, useContext } = await import('react');
  const ValueChangeContext = createContext<(value: string) => void>(
    () => undefined,
  );

  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: ReactNode;
      onValueChange?: (value: string) => void;
    }) => (
      <ValueChangeContext.Provider value={onValueChange ?? (() => undefined)}>
        <div>{children}</div>
      </ValueChangeContext.Provider>
    ),
    SelectContent: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      children,
      value,
    }: {
      children: ReactNode;
      value: string;
    }) => {
      const onValueChange = useContext(ValueChangeContext);

      return (
        <button
          data-value={value}
          onClick={() => onValueChange(value)}
          type="button"
        >
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children, ...props }: { children: ReactNode }) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => (
      <span>{placeholder}</span>
    ),
  };
});

function createVoice(overrides: Partial<Voice> = {}): Voice {
  return {
    externalVoiceId: 'voice-ext-1',
    id: 'voice-1',
    metadataLabel: 'Rachel',
    provider: 'heygen',
    sampleAudioUrl: 'https://example.com/rachel.mp3',
    voiceSource: 'catalog',
    ...overrides,
  } as Voice;
}

describe('BrandDetailIdentityCard.tsx', () => {
  const props: BrandDetailIdentityCardProps = {
    brand: {
      agentConfig: {},
      id: 'brand-1',
      label: 'Test Brand',
      scope: 'BRAND',
    } as BrandDetailIdentityCardProps['brand'],
    brandId: 'brand-1',
    onRefreshBrand: vi.fn().mockResolvedValue(undefined),
  };

  const refreshBrands = vi.fn().mockResolvedValue(undefined);

  function mockDefaults(): void {
    mockUseBrand.mockReturnValue({
      organizationId: 'org-1',
      refreshBrands,
    });
    mockUseOrganization.mockReturnValue({ settings: {} });
    mockUseAvatarImages.mockReturnValue({ avatars: [], isLoading: false });
    mockUseVoiceCatalog.mockReturnValue({ isLoading: false, voices: [] });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    updateAgentConfigMock.mockResolvedValue(undefined);
  });

  it('renders a preview for the selected brand voice', async () => {
    mockUseBrand.mockReturnValue({
      organizationId: 'org-1',
      refreshBrands: vi.fn().mockResolvedValue(undefined),
    });
    mockUseOrganization.mockReturnValue({
      settings: {
        defaultVoiceId: null,
        defaultVoiceRef: null,
      },
    });
    mockUseAvatarImages.mockReturnValue({
      avatars: [],
      isLoading: false,
    });
    mockUseVoiceCatalog.mockReturnValue({
      isLoading: false,
      voices: [
        createVoice({
          id: 'voice-brand',
          metadataLabel: 'Elizabeth',
          sampleAudioUrl: 'https://example.com/elizabeth.mp3',
        }),
      ],
    });

    render(
      <BrandDetailIdentityCard
        {...props}
        brand={{
          ...props.brand,
          agentConfig: {
            defaultVoiceId: 'voice-brand',
          },
        }}
      />,
    );

    expect(
      await screen.findByTestId('brand-default-voice-preview'),
    ).toBeInTheDocument();
    expect(screen.getByText('Selected voice preview')).toBeInTheDocument();
    expect(
      screen.getByTestId('brand-default-voice-preview-label'),
    ).toHaveTextContent('Elizabeth (heygen)');
    expect(
      screen.getByText('Elizabeth:https://example.com/elizabeth.mp3'),
    ).toBeInTheDocument();
  });

  it('renders organization fallback preview when no brand voice is selected', async () => {
    const fallbackVoice = createVoice({
      externalVoiceId: 'voice-org-ext',
      id: 'voice-org',
      metadataLabel: 'Fallback Voice',
      provider: 'elevenlabs',
      sampleAudioUrl: 'https://example.com/fallback.mp3',
    });

    mockUseBrand.mockReturnValue({
      organizationId: 'org-1',
      refreshBrands: vi.fn().mockResolvedValue(undefined),
    });
    mockUseOrganization.mockReturnValue({
      settings: {
        defaultVoiceId: 'voice-org',
        defaultVoiceRef: {
          externalVoiceId: 'voice-org-ext',
          provider: 'elevenlabs',
          source: 'catalog',
        },
      },
    });
    mockUseAvatarImages.mockReturnValue({
      avatars: [],
      isLoading: false,
    });
    mockUseVoiceCatalog.mockReturnValue({
      isLoading: false,
      voices: [fallbackVoice],
    });

    render(<BrandDetailIdentityCard {...props} />);

    expect(
      await screen.findByTestId('brand-default-voice-preview'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Organization fallback preview'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('brand-default-voice-preview-label'),
    ).toHaveTextContent('Fallback Voice (elevenlabs)');
    expect(
      screen.getByText('Fallback Voice:https://example.com/fallback.mp3'),
    ).toBeInTheDocument();
  });

  it('saves the selected avatar and voice defaults', async () => {
    mockDefaults();
    mockUseAvatarImages.mockReturnValue({
      avatars: [
        { id: 'avatar-1', ingredientUrl: 'https://example.com/a.png' },
        { id: 'avatar-2', ingredientUrl: 'https://example.com/b.png' },
      ],
      isLoading: false,
    });
    mockUseVoiceCatalog.mockReturnValue({
      isLoading: false,
      voices: [createVoice({ id: 'voice-1' })],
    });

    render(<BrandDetailIdentityCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rachel (heygen)' }));
    fireEvent.click(screen.getByTestId('save-brand-identity'));

    await waitFor(() =>
      expect(updateAgentConfigMock).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({
          defaultAvatarIngredientId: null,
          defaultVoiceId: 'voice-1',
        }),
      ),
    );

    expect(refreshBrands).toHaveBeenCalledOnce();
    expect(props.onRefreshBrand).toHaveBeenCalledOnce();
    expect(notifySuccessMock).toHaveBeenCalledWith(
      'Brand identity defaults saved',
    );
  });

  it('clears the avatar default back to the organization fallback', async () => {
    mockDefaults();
    mockUseAvatarImages.mockReturnValue({
      avatars: [{ id: 'avatar-1', ingredientUrl: 'https://example.com/a.png' }],
      isLoading: false,
    });

    render(
      <BrandDetailIdentityCard
        {...props}
        brand={
          {
            ...props.brand,
            agentConfig: { defaultAvatarIngredientId: 'avatar-1' },
          } as BrandDetailIdentityCardProps['brand']
        }
      />,
    );

    expect(screen.getByText('Selected Avatar Preview')).toBeInTheDocument();

    const avatarSelect = screen.getByTestId('brand-default-avatar-trigger')
      .parentElement as HTMLElement;
    fireEvent.click(
      within(avatarSelect).getByRole('button', {
        name: 'Use organization fallback',
      }),
    );
    fireEvent.click(screen.getByTestId('save-brand-identity'));

    await waitFor(() =>
      expect(updateAgentConfigMock).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({
          defaultAvatarIngredientId: null,
          defaultVoiceId: null,
        }),
      ),
    );
  });

  it('reports an error when saving identity defaults fails', async () => {
    mockDefaults();
    updateAgentConfigMock.mockRejectedValueOnce(new Error('save failed'));

    render(<BrandDetailIdentityCard {...props} />);

    fireEvent.click(screen.getByTestId('save-brand-identity'));

    await waitFor(() =>
      expect(notifyErrorMock).toHaveBeenCalledWith(
        'Failed to save brand identity defaults',
      ),
    );
    expect(loggerErrorMock).toHaveBeenCalled();
    expect(notifySuccessMock).not.toHaveBeenCalled();
  });

  it('announces the organization fallback and summarizes saved defaults', () => {
    mockDefaults();
    mockUseOrganization.mockReturnValue({
      settings: {
        defaultAvatarIngredientId: 'avatar-org',
        defaultVoiceId: 'voice-org',
      },
    });

    render(<BrandDetailIdentityCard {...props} />);

    expect(
      screen.getByText(
        'This brand is currently using organization identity defaults.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Saved avatar default/)).toBeInTheDocument();
    expect(screen.getByText(/Organization voice default/)).toBeInTheDocument();
  });

  it('falls back to neutral summaries when nothing is configured', () => {
    mockDefaults();

    render(<BrandDetailIdentityCard {...props} />);

    expect(
      screen.getByText(/No brand-specific default avatar/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No brand-specific default voice/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'This brand is currently using organization identity defaults.',
      ),
    ).not.toBeInTheDocument();
  });

  it('routes to the avatar and voice libraries', () => {
    mockDefaults();

    render(<BrandDetailIdentityCard {...props} />);

    fireEvent.click(screen.getByTestId('brand-browse-avatar-library'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Browse Voice Library' }),
    );

    expect(mockPush).toHaveBeenCalledTimes(2);
  });
});

// @vitest-environment jsdom

import type { Voice } from '@models/ingredients/voice.model';
import BrandDetailIdentityCard from '@pages/brands/components/sidebar/BrandDetailIdentityCard';
import type { BrandDetailIdentityCardProps } from '@props/pages/brand-detail.props';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';

const mockUseBrand = vi.fn();
const mockUseOrganization = vi.fn();
const mockUseAvatarImages = vi.fn();
const mockUseVoiceCatalog = vi.fn();
const mockPush = vi.fn();

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
  useAuthedService: () => vi.fn(),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
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

vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children, ...props }: { children: ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

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
});

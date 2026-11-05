import { CredentialPlatform } from '@genfeedai/contracts';
import type { BrandDetailSidebarProps } from '@props/pages/brand-detail.props';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandDetailSidebar from '@/features/brands/components/detail-sidebar/BrandDetailSidebar';

vi.mock('@ui/cards/brand-completeness-card/BrandCompletenessCard', () => ({
  default: () => <div>Brand Completeness Card</div>,
}));

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailAccountSettingsCard',
  () => ({
    default: () => <div>Account Settings Card</div>,
  }),
);

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailSocialMediaCard',
  () => ({
    default: () => <div>Social Media Card</div>,
  }),
);

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailConnectedAccountsSection',
  () => ({
    default: ({ connections }: { connections: unknown[] }) => (
      <div>Connected Accounts Section ({connections.length})</div>
    ),
  }),
);

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailExternalLinksCard',
  () => ({
    default: () => <div>External Links Card</div>,
  }),
);

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailDefaultModelsCard',
  () => ({
    default: () => <div>Default Models Card</div>,
  }),
);

vi.mock(
  '@/features/brands/components/brand-kit/writing-voice/BrandWritingVoiceEditor',
  () => ({
    default: () => <div>Agent Profile Card</div>,
  }),
);

vi.mock('@/features/brands/components/sidebar/BrandDetailIdentityCard', () => ({
  default: () => <div>Identity Card</div>,
}));

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailManualKitCard',
  () => ({
    default: () => <div>Manual Kit Card</div>,
  }),
);

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailReferencesCard',
  () => ({
    default: () => <div>References Card</div>,
  }),
);

describe('BrandDetailSidebar', () => {
  const props: BrandDetailSidebarProps = {
    brand: {
      id: 'brand-1',
      label: 'Test Brand',
      scope: 'BRAND',
    } as BrandDetailSidebarProps['brand'],
    brandId: 'brand-1',
    connectedPlatformsCount: 0,
    deletingRefId: null,
    links: [],
    onDeleteReference: vi.fn(),
    onOpenLinkModal: vi.fn(),
    onRefreshBrand: vi.fn().mockResolvedValue(undefined),
    onTogglePublicProfile: vi.fn(),
    onUploadBanner: vi.fn(),
    onUploadLogo: vi.fn(),
    onUploadReference: vi.fn(),
    socialConnections: [],
  };

  it('renders account settings and full social cards when manage href is unset', () => {
    render(<BrandDetailSidebar {...props} />);

    expect(screen.getByText('Account Settings Card')).toBeInTheDocument();
    expect(screen.getByText('Social Media Card')).toBeInTheDocument();
    expect(screen.getByText('External Links Card')).toBeInTheDocument();
    expect(
      screen.queryByText(/Connected Accounts Section/),
    ).not.toBeInTheDocument();
  });

  it('lists connected accounts as their own section when the manage href is set', () => {
    render(
      <BrandDetailSidebar
        {...props}
        manageSocialHref="/org/brand/settings/accounts"
        socialConnections={[
          {
            credentialId: 'cred-1',
            externalId: 'ext-1',
            isConnected: true,
            platform: CredentialPlatform.INSTAGRAM,
          },
          {
            credentialId: 'cred-2',
            externalId: 'ext-2',
            isConnected: true,
            platform: CredentialPlatform.GOOGLE_ADS,
          },
        ]}
      />,
    );

    expect(screen.getByText('Account Settings Card')).toBeInTheDocument();
    expect(
      screen.getByText('Connected Accounts Section (2)'),
    ).toBeInTheDocument();
    expect(screen.getByText('External Links Card')).toBeInTheDocument();
    expect(screen.queryByText('Social Media Card')).not.toBeInTheDocument();
  });
});

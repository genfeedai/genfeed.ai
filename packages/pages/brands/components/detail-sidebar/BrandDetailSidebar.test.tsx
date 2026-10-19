import { CredentialPlatform } from '@genfeedai/contracts';
import BrandDetailSidebar from '@pages/brands/components/detail-sidebar/BrandDetailSidebar';
import type { BrandDetailSidebarProps } from '@props/pages/brand-detail.props';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/cards/brand-completeness-card/BrandCompletenessCard', () => ({
  default: () => <div>Brand Completeness Card</div>,
}));

vi.mock(
  '@pages/brands/components/sidebar/BrandDetailAccountSettingsCard',
  () => ({
    default: () => <div>Account Settings Card</div>,
  }),
);

vi.mock('@pages/brands/components/sidebar/BrandDetailSocialMediaCard', () => ({
  default: () => <div>Social Media Card</div>,
}));

vi.mock(
  '@pages/brands/components/sidebar/BrandDetailExternalLinksCard',
  () => ({
    default: ({ social }: { social?: { connectedSocialCount: number } }) => (
      <div>
        External Links Card
        {social ? ` (${social.connectedSocialCount} social)` : ''}
      </div>
    ),
  }),
);

vi.mock(
  '@pages/brands/components/sidebar/BrandDetailDefaultModelsCard',
  () => ({
    default: () => <div>Default Models Card</div>,
  }),
);

vi.mock(
  '@pages/brands/components/brand-kit/writing-voice/BrandWritingVoiceEditor',
  () => ({
    default: () => <div>Agent Profile Card</div>,
  }),
);

vi.mock('@pages/brands/components/sidebar/BrandDetailIdentityCard', () => ({
  default: () => <div>Identity Card</div>,
}));

vi.mock('@pages/brands/components/sidebar/BrandDetailManualKitCard', () => ({
  default: () => <div>Manual Kit Card</div>,
}));

vi.mock('@pages/brands/components/sidebar/BrandDetailReferencesCard', () => ({
  default: () => <div>References Card</div>,
}));

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
    expect(screen.queryByText(/social\)/)).not.toBeInTheDocument();
  });

  it('merges social into the links card when only social manage href is set', () => {
    render(
      <BrandDetailSidebar
        {...props}
        manageSocialHref="/org/brand/settings/connected-accounts"
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
    // Google Ads is an ad account, not a social profile, so it is not counted.
    expect(
      screen.getByText('External Links Card (1 social)'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Social Media Card')).not.toBeInTheDocument();
  });
});

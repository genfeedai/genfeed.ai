import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandOsSettingsCardProps } from '@/features/brands/props/brand-os-settings.props';
import BrandKitPage from './content';

const mocks = vi.hoisted(() => ({
  role: 'owner',
  capture: vi.fn(),
  push: vi.fn(),
  upload: vi.fn(),
  revisionContent: {
    id: 'draft-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    status: 'ready',
    sourceType: 'manual',
    assetCandidates: [],
    diagnostics: [],
    evidence: [],
    fields: {
      description: {
        key: 'description',
        label: 'Description',
        group: 'profile',
        ownerPath: 'brand.description',
        applyActionDefault: 'accept',
        currentValue: 'Saved description',
        proposedValue: 'Proposed description',
        diagnostics: [],
        evidence: [],
      },
    },
    readiness: {
      status: 'complete',
      score: 100,
      requiredFields: [],
      missingFields: [],
      diagnostics: [],
    },
  } satisfies IBrandKitDraft,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/acme/acme/settings/brand-kit',
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/acme${path}` }),
}));
vi.mock('@/hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => mocks.role,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));
vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: vi.fn() },
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@/lib/analytics', () => ({
  captureBrandOsFunnelStage: mocks.capture,
}));
vi.mock('@/hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => ({
    brand: { id: 'brand-1', label: 'Acme', description: 'Acme', slug: 'acme' },
    brandId: 'brand-1',
    deletingRefId: null,
    handleOpenUploadModal: mocks.upload,
    handleRefreshBrand: vi.fn(),
    handleRequestDeleteReference: vi.fn(),
    hasBrandId: true,
    isLoading: false,
  }),
}));
vi.mock('@/features/brands/components/brand-kit/BrandOsSettingsCard', () => ({
  default: ({ renderWorkspace }: BrandOsSettingsCardProps) =>
    renderWorkspace?.({
      content: mocks.revisionContent,
      approvedContent: null,
      renderFields: (groups) => <p>Revision fields: {groups.join(', ')}</p>,
      review: <p>Revision history and export</p>,
      isDirty: true,
      isLoading: false,
      isSaveDisabled: false,
      isReadOnly: false,
      error: null,
      onSave: vi.fn(),
      onVideoChange: vi.fn(),
      onFinishingChange: vi.fn(),
    }),
}));
vi.mock('@/features/brands/components/brand-kit/BrandKitReviewCard', () => ({
  default: (props: {
    loadClaimedBrandOsDraft?: boolean;
    onDraftCreated?: unknown;
  }) => (
    <p
      data-testid="scan"
      data-claimed={String(props.loadClaimedBrandOsDraft)}
      data-persist={String(Boolean(props.onDraftCreated))}
    >
      Scan workflow
    </p>
  ),
}));
vi.mock(
  '@/features/brands/components/sidebar/BrandDetailManualKitCard',
  () => ({
    default: () => <p>Manual draft workflow</p>,
  }),
);
vi.mock(
  '@/features/brands/components/brand-kit/writing-voice/BrandWritingVoiceEditor',
  () => ({
    default: ({ section }: { section: string }) => <p>Live {section} editor</p>,
  }),
);
vi.mock(
  '@/features/brands/components/sidebar/BrandDetailReferencesCard',
  () => ({
    default: () => <p>References</p>,
  }),
);
vi.mock('@ui/cards/brand-completeness-card/BrandCompletenessCard', () => ({
  default: () => <p>Completeness</p>,
}));
vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    right,
  }: {
    children: ReactNode;
    right?: ReactNode;
  }) => (
    <div>
      <div data-testid="subbar">{right}</div>
      {children}
    </div>
  ),
}));
describe('Brand Kit workspace', () => {
  beforeEach(() => {
    mocks.role = 'owner';
  });

  it('shows every section on one page, with no tabs and no duplicate page heading', () => {
    render(<BrandKitPage />);
    expect(
      screen.queryByRole('tab', { name: 'Overview' }),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Identity',
      'Visual identity',
      'Writing voice',
      'Strategy',
      'Video',
    ]);
    expect(
      screen.queryByRole('heading', { name: 'Brand Kit' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('brand-kit-local-preview')).toBeInTheDocument();
  });

  it('collapses and restores the preview rail', () => {
    render(<BrandKitPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide preview' }));
    expect(
      screen.queryByTestId('brand-kit-local-preview'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show preview' }));
    expect(screen.getByTestId('brand-kit-local-preview')).toBeInTheDocument();
  });

  it('opens revision history from Review changes only', () => {
    render(<BrandKitPage />);
    expect(
      screen.queryByText('Revision history and export'),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId('subbar')).getByRole('button', {
        name: 'Review changes',
      }),
    );
    expect(screen.getByText('Revision history and export')).toBeInTheDocument();
  });

  it('puts the page actions in the shared subbar', () => {
    render(<BrandKitPage />);
    const subbar = within(screen.getByTestId('subbar'));
    expect(
      subbar.getByRole('button', { name: 'Scan website' }),
    ).toBeInTheDocument();
    expect(
      subbar.getByRole('button', { name: 'Brand Kit actions' }),
    ).toBeInTheDocument();
    expect(
      subbar.getByRole('button', { name: 'Review changes' }),
    ).toBeInTheDocument();
  });

  it('retains captured drafts and read-only member scan access without revision write callbacks', () => {
    mocks.role = 'member';
    try {
      render(<BrandKitPage />);
      expect(screen.getByTestId('scan')).toHaveAttribute(
        'data-claimed',
        'true',
      );
      expect(screen.getByTestId('scan')).toHaveAttribute(
        'data-persist',
        'false',
      );
    } finally {
      mocks.role = 'owner';
    }
  });

  it('edits voice and strategy in their live editors and keeps the revision fields for visual and identity', () => {
    render(<BrandKitPage />);
    expect(screen.getByText('Live voice editor')).toBeInTheDocument();
    expect(screen.getByText('Live strategy editor')).toBeInTheDocument();
    expect(
      screen.getByText('Revision fields: profile, links'),
    ).toBeInTheDocument();
    expect(screen.getByText('Revision fields: visual')).toBeInTheDocument();
  });

  it('keeps one save bar for the revision draft', () => {
    render(<BrandKitPage />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Unsaved revision changes',
    );
    expect(screen.getAllByRole('button', { name: 'Save draft' })).toHaveLength(
      1,
    );
  });
});

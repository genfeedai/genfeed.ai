import type { IBrand, IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandKitReviewCard from './BrandKitReviewCard';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({
  applyBrandKitDraft: vi.fn(),
  crawlBrandKitWebsite: vi.fn(),
  getBrandsService: vi.fn(),
  getClaimedBrandOsDraft: vi.fn(),
  importBrandKitAssets: vi.fn(),
  loggerError: vi.fn(),
  onRefreshBrand: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getBrandsService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    bodyClassName: _bodyClassName,
    children,
    description,
    label,
    ...props
  }: HTMLAttributes<HTMLElement> & {
    bodyClassName?: string;
    children: ReactNode;
    description?: string;
    label?: string;
  }) => (
    <section {...props}>
      {label ? <h2>{label}</h2> : null}
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    'aria-busy': ariaBusy,
    ariaLabel,
    children,
    className,
    isDisabled,
    label,
    onClick,
  }: {
    'aria-busy'?: boolean;
    ariaLabel?: string;
    children?: ReactNode;
    className?: string;
    isDisabled?: boolean;
    label?: ReactNode;
    onClick?: () => void;
  }) => (
    <button
      aria-label={ariaLabel}
      aria-busy={ariaBusy}
      className={className}
      disabled={isDisabled}
      type="button"
      onClick={onClick}
    >
      {children ?? label}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    'aria-label': ariaLabel,
    className,
    onChange,
    placeholder,
    value,
  }: {
    'aria-label'?: string;
    className?: string;
    onChange?: (event: { target: { value: string } }) => void;
    placeholder?: string;
    value?: string;
  }) => (
    <input
      aria-label={ariaLabel}
      className={className}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange?.(event)}
    />
  ),
}));

vi.mock('@ui/primitives/textarea', () => ({
  Textarea: ({
    'aria-label': ariaLabel,
    id,
    onChange,
    placeholder,
    value,
  }: {
    'aria-label'?: string;
    id?: string;
    onChange?: (event: { target: { value: string } }) => void;
    placeholder?: string;
    value?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      id={id}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange?.(event)}
    />
  ),
}));

vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: ({
    'aria-label': ariaLabel,
    isChecked,
    label,
    onCheckedChange,
  }: {
    'aria-label'?: string;
    isChecked?: boolean;
    label?: ReactNode;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <label>
      <input
        aria-label={ariaLabel}
        checked={isChecked}
        type="checkbox"
        onChange={(event) => onCheckedChange?.(event.target.checked)}
      />
      {label}
    </label>
  ),
}));

function createDraft(): IBrandKitDraft {
  return {
    assetCandidates: [
      {
        candidateId: 'candidate-logo',
        label: 'Website logo',
        role: 'logo',
        sourceType: 'website',
        sourceUrl: 'https://acme.test/logo.png',
        url: 'https://acme.test/logo.png',
        width: 512,
        height: 512,
      },
    ],
    brandId: 'brand-1',
    diagnostics: [
      {
        code: 'brand_kit_source_confirmed',
        message: 'Website metadata matched the public homepage.',
        severity: 'info',
      },
    ],
    evidence: [
      {
        confidence: 0.96,
        excerpt: 'Acme builds operational tools.',
        label: 'Acme homepage',
        sourceType: 'website',
        url: 'https://acme.test',
      },
    ],
    fields: {
      description: {
        applyActionDefault: 'preserve',
        currentValue: 'Old description',
        confidence: 0.91,
        diagnostics: [],
        evidence: [
          {
            confidence: 0.91,
            label: 'Homepage description',
            sourceType: 'website',
            url: 'https://acme.test/about',
          },
        ],
        group: 'profile',
        key: 'description',
        label: 'Description',
        ownerPath: 'brand.description',
        proposedValue: 'New description',
      },
      logo: {
        applyActionDefault: 'preserve',
        currentValue: undefined,
        diagnostics: [],
        evidence: [
          {
            confidence: 0.88,
            label: 'Website logo',
            sourceType: 'website',
            url: 'https://acme.test/logo.png',
          },
        ],
        group: 'assets',
        key: 'logo',
        label: 'Logo',
        ownerPath: 'brand.logo',
        proposedValue: {
          role: 'logo',
          sourceType: 'website',
          url: 'https://acme.test/logo.png',
        },
      },
      voiceTone: {
        applyActionDefault: 'preserve',
        currentValue: 'plain',
        diagnostics: [],
        evidence: [],
        group: 'voice',
        key: 'voiceTone',
        label: 'Voice tone',
        ownerPath: 'brand.agentConfig.voice.tone',
        proposedValue: 'sharp',
      },
      voiceStyle: {
        applyActionDefault: 'preserve',
        currentValue: '',
        diagnostics: [],
        evidence: [],
        group: 'voice',
        key: 'voiceStyle',
        label: 'Voice style',
        ownerPath: 'brand.agentConfig.voice.style',
        proposedValue: '   ',
      },
      strategyPlatforms: {
        applyActionDefault: 'preserve',
        currentValue: [],
        diagnostics: [],
        evidence: [],
        group: 'strategy',
        key: 'strategyPlatforms',
        label: 'Platforms',
        ownerPath: 'brand.agentConfig.strategy.platforms',
        proposedValue: [],
      },
      strategyGoals: {
        applyActionDefault: 'preserve',
        diagnostics: [],
        evidence: [],
        group: 'strategy',
        key: 'strategyGoals',
        label: 'Goals',
        ownerPath: 'brand.agentConfig.strategy.goals',
      },
      socialLinks: {
        applyActionDefault: 'preserve',
        currentValue: [],
        diagnostics: [],
        evidence: [],
        group: 'links',
        key: 'socialLinks',
        label: 'Social links',
        ownerPath: 'brand.links',
        proposedValue: [
          {
            platform: 'instagram',
            sourceType: 'website',
            url: 'https://instagram.com/acme',
          },
          {
            platform: 'linkedin',
            sourceType: 'website',
            url: 'https://linkedin.com/company/acme',
          },
        ],
      },
    },
    id: 'brand-1',
    readiness: {
      diagnostics: [],
      missingFields: ['banner'],
      requiredFields: ['description', 'logo', 'banner'],
      score: 67,
      status: 'partial',
    },
    sourceType: 'website',
    status: 'partial',
  };
}

const brandFixture = {
  id: 'brand-1',
  label: 'Acme',
} as IBrand;

function expandReviewSection(label: string) {
  const trigger = screen.getByRole('button', { name: label });
  if (trigger.getAttribute('data-state') !== 'open') {
    fireEvent.click(trigger);
  }
}

describe('BrandKitReviewCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.crawlBrandKitWebsite.mockResolvedValue(createDraft());
    mocks.applyBrandKitDraft.mockResolvedValue({
      appliedFields: ['description', 'voiceTone'],
      brandId: 'brand-1',
      diagnostics: [
        {
          code: 'brand_kit_apply_deferred_field',
          fieldKey: 'logo',
          message: 'Logo import is preserved for safe asset handling.',
          severity: 'warning',
        },
      ],
      preservedFields: ['logo'],
      status: 'partial',
    });
    mocks.importBrandKitAssets.mockResolvedValue({
      brandId: 'brand-1',
      diagnostics: [],
      failedCandidateIds: [],
      importedAssetIds: ['asset-1'],
      skippedCandidateIds: [],
      status: 'complete',
    });
    mocks.getBrandsService.mockResolvedValue({
      applyBrandKitDraft: mocks.applyBrandKitDraft,
      crawlBrandKitWebsite: mocks.crawlBrandKitWebsite,
      getClaimedBrandOsDraft: mocks.getClaimedBrandOsDraft,
      importBrandKitAssets: mocks.importBrandKitAssets,
    });
    mocks.onRefreshBrand.mockResolvedValue(undefined);
  });

  it('loads a claimed Brand OS draft into the canonical review flow', async () => {
    const onLoaded = vi.fn();
    const onAccepted = vi.fn();
    mocks.getClaimedBrandOsDraft.mockResolvedValue({
      draft: createDraft(),
      expiresAt: new Date().toISOString(),
      id: 'brand-1',
      status: 'claimed',
    });

    render(
      <BrandKitReviewCard
        brand={brandFixture}
        brandId="brand-1"
        loadClaimedBrandOsDraft
        onBrandOsDraftAccepted={onAccepted}
        onBrandOsDraftLoaded={onLoaded}
        onRefreshBrand={mocks.onRefreshBrand}
      />,
    );

    expect(await screen.findByText('67% readiness')).toBeInTheDocument();
    expect(screen.getByTestId('brand-kit-review-card')).toHaveAttribute(
      'data-brand-os-state',
      'saved',
    );
    expect(mocks.getClaimedBrandOsDraft).toHaveBeenCalledWith('brand-1');
    expect(onLoaded).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply Selected Fields' }),
    );
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('brand-kit-review-card')).toHaveAttribute(
      'data-brand-os-state',
      'accepted',
    );
  });

  it('treats a missing claimed draft as an empty review, not a failure', async () => {
    const onLoaded = vi.fn();
    mocks.getClaimedBrandOsDraft.mockResolvedValue(null);

    render(
      <BrandKitReviewCard
        brand={brandFixture}
        brandId="brand-1"
        loadClaimedBrandOsDraft
        onBrandOsDraftLoaded={onLoaded}
        onRefreshBrand={mocks.onRefreshBrand}
      />,
    );

    await waitFor(() => {
      expect(mocks.getClaimedBrandOsDraft).toHaveBeenCalledWith('brand-1');
    });
    expect(onLoaded).not.toHaveBeenCalled();
    expect(mocks.loggerError).not.toHaveBeenCalled();
    expect(screen.getByTestId('brand-kit-review-card')).not.toHaveAttribute(
      'data-brand-os-state',
    );
  });

  it('logs a claimed-draft read failure without blocking the review card', async () => {
    mocks.getClaimedBrandOsDraft.mockRejectedValue(new Error('network'));

    render(
      <BrandKitReviewCard
        brand={brandFixture}
        brandId="brand-1"
        loadClaimedBrandOsDraft
        onRefreshBrand={mocks.onRefreshBrand}
      />,
    );

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to read claimed Brand OS draft',
        expect.any(Error),
      );
    });
    expect(screen.getByTestId('brand-kit-review-card')).toBeInTheDocument();
  });

  it('scans, reviews editable fields, and applies selected fields', async () => {
    render(
      <BrandKitReviewCard
        brand={brandFixture}
        brandId="brand-1"
        onRefreshBrand={mocks.onRefreshBrand}
      />,
    );

    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'https://acme.test' },
    });
    fireEvent.change(screen.getByLabelText('Social URLs'), {
      target: { value: 'https://linkedin.com/company/acme' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

    await waitFor(() => {
      expect(mocks.crawlBrandKitWebsite).toHaveBeenCalledWith('brand-1', {
        socialUrls: ['https://linkedin.com/company/acme'],
        url: 'https://acme.test',
      });
    });

    expect(screen.getByText('67% readiness')).toBeInTheDocument();
    expect(screen.queryByText('Pick images below')).not.toBeInTheDocument();
    expect(screen.queryByText('Voice style')).not.toBeInTheDocument();
    expect(screen.queryByText('Platforms')).not.toBeInTheDocument();
    expect(screen.queryByText('Goals')).not.toBeInTheDocument();
    expect(screen.queryByText('No proposal')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Confidence: not scored'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Select Logo')).toBeInTheDocument();
    expandReviewSection('Social links');
    expandReviewSection('Logo');
    expandReviewSection('Asset Candidates');
    expandReviewSection('Description');
    const instagram = screen.getByRole('link', {
      name: 'https://instagram.com/acme',
    });
    expect(instagram).toHaveAttribute('href', 'https://instagram.com/acme');
    expect(instagram.parentElement?.querySelector('svg')).not.toBeNull();
    expect(screen.queryByText(/^instagram$/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://linkedin.com/company/acme' }),
    ).toHaveAttribute('href', 'https://linkedin.com/company/acme');
    expect(screen.getByAltText('Website logo')).toHaveAttribute(
      'src',
      'https://acme.test/logo.png',
    );
    expect(screen.getByAltText('logo')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Description proposed value'), {
      target: { value: 'Edited description' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply Selected Fields' }),
    );

    await waitFor(() => {
      expect(mocks.applyBrandKitDraft).toHaveBeenCalledWith('brand-1', {
        draftId: 'brand-1',
        fields: {
          description: {
            action: 'accept',
            value: 'Edited description',
          },
          logo: {
            action: 'accept',
            value: {
              role: 'logo',
              sourceType: 'website',
              url: 'https://acme.test/logo.png',
            },
          },
          socialLinks: {
            action: 'accept',
            value: [
              {
                platform: 'instagram',
                sourceType: 'website',
                url: 'https://instagram.com/acme',
              },
              {
                platform: 'linkedin',
                sourceType: 'website',
                url: 'https://linkedin.com/company/acme',
              },
            ],
          },
          voiceTone: {
            action: 'accept',
            value: 'sharp',
          },
        },
      });
      expect(mocks.onRefreshBrand).toHaveBeenCalled();
    });
  });

  it('applies one field from its row Apply button', async () => {
    mocks.applyBrandKitDraft.mockResolvedValue({
      appliedFields: ['description'],
      brandId: 'brand-1',
      diagnostics: [],
      preservedFields: [],
      status: 'partial',
    });

    render(
      <BrandKitReviewCard
        brand={brandFixture}
        brandId="brand-1"
        onRefreshBrand={mocks.onRefreshBrand}
      />,
    );

    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'https://acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

    await screen.findByRole('button', { name: 'Apply Description' });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Description' }));

    await waitFor(() => {
      expect(mocks.applyBrandKitDraft).toHaveBeenCalledWith('brand-1', {
        draftId: 'brand-1',
        fields: {
          description: {
            action: 'accept',
            value: 'New description',
          },
        },
      });
    });

    expect(
      screen.queryByLabelText('Select Description'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Apply Description' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('New description')).not.toBeInTheDocument();
  });

  it('does not keep a dead Refresh brand control', async () => {
    render(
      <BrandKitReviewCard
        brand={brandFixture}
        brandId="brand-1"
        onRefreshBrand={mocks.onRefreshBrand}
      />,
    );

    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'https://acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    await screen.findByText('67% readiness');

    expect(
      screen.queryByRole('button', { name: /refresh brand/i }),
    ).not.toBeInTheDocument();
  });

  it('applies the scanned logo and ignores empty proposals', async () => {
    const onDraftCreated = vi.fn().mockResolvedValue(undefined);
    mocks.applyBrandKitDraft.mockResolvedValue({
      appliedFields: ['description', 'logo', 'socialLinks', 'voiceTone'],
      appliedValues: {
        socialLinks: [
          {
            label: 'Instagram',
            platform: 'instagram',
            url: 'https://instagram.com/acme',
          },
        ],
      },
      brandId: 'brand-1',
      diagnostics: [],
      preservedFields: [],
      status: 'accepted',
    });
    render(
      <BrandKitReviewCard
        brand={brandFixture}
        brandId="brand-1"
        onDraftCreated={onDraftCreated}
        onRefreshBrand={mocks.onRefreshBrand}
      />,
    );

    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'https://acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

    await screen.findAllByText('Logo');
    expect(screen.getByLabelText('Select Logo')).toBeChecked();
    expect(screen.queryByLabelText('Select Platforms')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Select Goals')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply Selected Fields' }),
    );

    await waitFor(() => {
      expect(mocks.applyBrandKitDraft).toHaveBeenCalled();
    });

    const applyPayload = mocks.applyBrandKitDraft.mock.calls[0]?.[1] as {
      fields: Record<string, { value: unknown } | undefined>;
    };
    expect(applyPayload.fields.logo).toEqual({
      action: 'accept',
      value: {
        role: 'logo',
        sourceType: 'website',
        url: 'https://acme.test/logo.png',
      },
    });
    expect(applyPayload.fields.strategyPlatforms).toBeUndefined();
    expect(applyPayload.fields.strategyGoals).toBeUndefined();
    expect(applyPayload.fields.voiceStyle).toBeUndefined();
    expandReviewSection('Social links');
    await waitFor(() => {
      expect(onDraftCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.objectContaining({
            socialLinks: expect.objectContaining({
              currentValue: [
                {
                  label: 'Instagram',
                  platform: 'instagram',
                  url: 'https://instagram.com/acme',
                },
              ],
              proposedValue: [
                {
                  platform: 'linkedin',
                  sourceType: 'website',
                  url: 'https://linkedin.com/company/acme',
                },
              ],
            }),
          }),
        }),
      );
    });
    expect(
      screen.getByRole('link', { name: 'https://linkedin.com/company/acme' }),
    ).toBeInTheDocument();
  });

  it('imports the asset candidates picked from the image grid', async () => {
    render(
      <BrandKitReviewCard
        brand={brandFixture}
        brandId="brand-1"
        onRefreshBrand={mocks.onRefreshBrand}
      />,
    );

    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'https://acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

    const importButton = await screen.findByRole('button', {
      name: 'Import Selected Assets',
    });
    expect(importButton).toBeDisabled();
    expandReviewSection('Asset Candidates');

    fireEvent.click(
      screen.getByRole('button', { name: 'Select Website logo' }),
    );
    fireEvent.click(screen.getByLabelText('Replace existing logo and banner'));
    fireEvent.click(importButton);

    await waitFor(() => {
      expect(mocks.importBrandKitAssets).toHaveBeenCalledWith('brand-1', {
        assets: [
          {
            candidateId: 'candidate-logo',
            height: 512,
            label: 'Website logo',
            replaceExisting: true,
            role: 'logo',
            sourceType: 'website',
            sourceUrl: 'https://acme.test/logo.png',
            url: 'https://acme.test/logo.png',
            width: 512,
          },
        ],
      });
      expect(mocks.onRefreshBrand).toHaveBeenCalled();
    });

    expect(
      await screen.findByText(/Imported 1 assets; skipped 0; failed 0/),
    ).toBeInTheDocument();
  });

  it('selects a proposed image in place and imports it from the field', async () => {
    render(
      <BrandKitReviewCard
        brand={brandFixture}
        brandId="brand-1"
        onRefreshBrand={mocks.onRefreshBrand}
      />,
    );

    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'https://acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

    await screen.findByRole('button', { name: 'Import Selected Assets' });
    expandReviewSection('Logo');

    fireEvent.click(screen.getByRole('button', { name: 'Select logo' }));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Import Selected Assets' })[0],
    );

    await waitFor(() => {
      expect(mocks.importBrandKitAssets).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({
          assets: [
            expect.objectContaining({
              candidateId: 'candidate-logo',
              role: 'logo',
            }),
          ],
        }),
      );
    });
  });

  it('keeps authenticated evidence review compact and explicit', async () => {
    const { container } = render(
      <BrandKitReviewCard
        brand={brandFixture}
        brandId="brand-1"
        onRefreshBrand={mocks.onRefreshBrand}
      />,
    );

    expect(
      container.querySelector('[data-scale-role="product"]'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Website URL')).toHaveClass('h-8');
    expect(screen.getByRole('button', { name: 'Scan' })).toHaveClass('h-8');

    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'https://acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

    await screen.findByText('67% readiness');

    expect(screen.getAllByText('extracted').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Verify').length).toBeGreaterThan(0);
    expect(screen.queryByText('inferred')).not.toBeInTheDocument();
    expect(screen.getByText('missing')).toBeInTheDocument();
    expect(
      screen.queryByText('Confidence: not scored'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Confidence: 91%')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Homepage description' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Website metadata matched the public homepage.'),
    ).not.toBeInTheDocument();
    expandReviewSection('Description');
    expandReviewSection('Diagnostics');
    expect(
      screen.getByRole('link', { name: 'Homepage description' }),
    ).toHaveAttribute('href', 'https://acme.test/about');
    expect(
      screen.getByText('Website metadata matched the public homepage.'),
    ).toBeInTheDocument();
  });

  it('labels proposed colors as candidates rather than product tokens', async () => {
    const draft = createDraft();
    draft.fields.primaryColor = {
      applyActionDefault: 'preserve',
      confidence: 0.64,
      currentValue: '#0A0A0A',
      diagnostics: [],
      evidence: [
        {
          confidence: 0.64,
          label: 'Homepage color sample',
          sourceType: 'website',
          url: 'https://acme.test',
        },
      ],
      group: 'visual',
      key: 'primaryColor',
      label: 'Primary color',
      ownerPath: 'brand.primaryColor',
      proposedValue: '#051230',
    };
    mocks.crawlBrandKitWebsite.mockResolvedValueOnce(draft);

    render(
      <BrandKitReviewCard
        brand={brandFixture}
        brandId="brand-1"
        onRefreshBrand={mocks.onRefreshBrand}
      />,
    );

    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'https://acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

    await screen.findByText('Primary color');

    expect(screen.queryByText('candidate')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Candidate only · not a Genfeed product token'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('Verify').length).toBeGreaterThan(0);
    expandReviewSection('Primary color');
    expect(screen.getByLabelText('Primary color proposed value')).toHaveValue(
      '#051230',
    );
  });

  it('announces scanning and failed scans with the right live semantics', async () => {
    let rejectScan: (reason: Error) => void = () => undefined;
    mocks.crawlBrandKitWebsite.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectScan = reject;
      }),
    );

    render(
      <BrandKitReviewCard
        brand={brandFixture}
        brandId="brand-1"
        onRefreshBrand={mocks.onRefreshBrand}
      />,
    );

    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'https://acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

    expect(
      screen.getByRole('button', { name: 'Scanning brand sources' }),
    ).toHaveAttribute('aria-busy', 'true');

    rejectScan(new Error('network down'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to scan website for brand kit fields.',
    );
  });
  it('retains scanned fields and reports revision persistence failures separately', async () => {
    const onDraftCreated = vi
      .fn()
      .mockRejectedValue(new Error('Revision unavailable'));
    render(
      <BrandKitReviewCard
        brand={brandFixture}
        brandId="brand-1"
        onRefreshBrand={mocks.onRefreshBrand}
        onDraftCreated={onDraftCreated}
      />,
    );
    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'https://acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Website scan succeeded, but the draft could not be saved as a revision.',
    );
    expect(screen.getByText('67% readiness')).toBeInTheDocument();
    expect(
      screen.queryByText('Failed to scan website for brand kit fields.'),
    ).not.toBeInTheDocument();
    expect(onDraftCreated).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1' }),
    );
  });
});

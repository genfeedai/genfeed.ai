import type { IBrand, IBrandKitDraft } from '@genfeedai/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandKitReviewCard from './BrandKitReviewCard';

const mocks = vi.hoisted(() => ({
  applyBrandKitDraft: vi.fn(),
  crawlBrandKitWebsite: vi.fn(),
  getBrandsService: vi.fn(),
  loggerError: vi.fn(),
  onRefreshBrand: vi.fn(),
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
    children,
    description,
    label,
  }: {
    children: ReactNode;
    description?: string;
    label?: string;
  }) => (
    <section>
      {label ? <h2>{label}</h2> : null}
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    label,
    onClick,
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    label?: ReactNode;
    onClick?: () => void;
  }) => (
    <button disabled={isDisabled} type="button" onClick={onClick}>
      {children ?? label}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: ({
    label,
    onChange,
    placeholder,
    value,
  }: {
    label?: string;
    onChange?: (event: { target: { value: string } }) => void;
    placeholder?: string;
    value?: string;
  }) => (
    <label>
      {label}
      <input
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange?.(event)}
      />
    </label>
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
    diagnostics: [],
    evidence: [],
    fields: {
      description: {
        applyActionDefault: 'preserve',
        currentValue: 'Old description',
        diagnostics: [],
        evidence: [],
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
        evidence: [],
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
    },
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
    mocks.getBrandsService.mockResolvedValue({
      applyBrandKitDraft: mocks.applyBrandKitDraft,
      crawlBrandKitWebsite: mocks.crawlBrandKitWebsite,
    });
    mocks.onRefreshBrand.mockResolvedValue(undefined);
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
    fireEvent.click(screen.getByRole('button', { name: 'Scan Website' }));

    await waitFor(() => {
      expect(mocks.crawlBrandKitWebsite).toHaveBeenCalledWith('brand-1', {
        socialUrls: ['https://linkedin.com/company/acme'],
        url: 'https://acme.test',
      });
    });

    expect(screen.getByText('67% readiness')).toBeInTheDocument();
    expect(screen.getByText('Safe import pending')).toBeInTheDocument();
    expect(screen.getByText(/candidate-logo/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Description proposed value'), {
      target: { value: 'Edited description' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply Selected Fields' }),
    );

    await waitFor(() => {
      expect(mocks.applyBrandKitDraft).toHaveBeenCalledWith('brand-1', {
        draftId: undefined,
        fields: {
          description: {
            action: 'accept',
            value: 'Edited description',
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

  it('does not apply deferred asset fields by default', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Scan Website' }));

    await screen.findByText('Logo');

    expect(screen.queryByLabelText('Apply Logo')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply Selected Fields' }),
    );

    await waitFor(() => {
      expect(mocks.applyBrandKitDraft).toHaveBeenCalled();
    });

    const applyPayload = mocks.applyBrandKitDraft.mock.calls[0]?.[1];
    expect(applyPayload.fields.logo).toBeUndefined();
  });
});

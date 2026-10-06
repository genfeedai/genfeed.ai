import type { IBrand, IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import BrandKitLocalPreview from '@pages/brands/components/brand-kit/BrandKitLocalPreview';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/brand-kit',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
const brand = {
  id: 'brand-1',
  label: 'Acme',
  slug: 'acme',
  description: 'Build useful things.',
  primaryColor: '#222222',
  secondaryColor: '#ffffff',
  backgroundColor: '#000000',
  fontFamily: 'MONTSERRAT_BOLD',
  agentConfig: { voice: { sampleOutput: 'Saved live sample' } },
} as IBrand;
function draft(sample: string): IBrandKitDraft {
  return {
    id: 'draft-1',
    brandId: brand.id,
    status: 'ready',
    sourceType: 'manual',
    assetCandidates: [],
    evidence: [],
    diagnostics: [],
    readiness: {
      status: 'complete',
      score: 100,
      requiredFields: [],
      missingFields: [],
      diagnostics: [],
    },
    fields: {
      voiceSampleOutput: {
        key: 'voiceSampleOutput',
        label: 'Sample output',
        group: 'voice',
        ownerPath: 'brand.agentConfig.voice.sampleOutput',
        proposedValue: sample,
        applyActionDefault: 'accept',
        evidence: [],
        diagnostics: [],
      },
    },
  };
}
describe('local brand preview', () => {
  it('renders unsaved draft content and switches to an independent approved snapshot', () => {
    const approved = draft('Approved sample');
    const { rerender } = render(
      <BrandKitLocalPreview
        brand={brand}
        content={draft('Unsaved draft sample')}
        approvedContent={approved}
      />,
    );
    expect(screen.getByText('Unsaved draft sample')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Approved' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText('Approved sample')).toBeInTheDocument();
    rerender(
      <BrandKitLocalPreview
        brand={brand}
        content={draft('Changed draft sample')}
        approvedContent={approved}
      />,
    );
    expect(screen.getByText('Approved sample')).toBeInTheDocument();
    expect(screen.queryByText('Changed draft sample')).not.toBeInTheDocument();
    expect(screen.getByText(/no credits/)).toBeInTheDocument();
  });
  it('keeps preserved and rejected approved fields independent of later live brand changes', () => {
    const approved = draft('Excluded proposal');
    const field = approved.fields.voiceSampleOutput;
    if (!field) throw new Error('Missing fixture field');
    field.applyActionDefault = 'reject';
    field.currentValue = 'Snapshot sample';
    const { rerender } = render(
      <BrandKitLocalPreview
        brand={brand}
        content={null}
        approvedContent={approved}
      />,
    );
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Approved' }), {
      button: 0,
      ctrlKey: false,
    });
    const changedBrand = {
      ...brand,
      label: 'Renamed live brand',
      agentConfig: { voice: { sampleOutput: 'Changed live sample' } },
    };
    rerender(
      <BrandKitLocalPreview
        brand={changedBrand}
        content={null}
        approvedContent={approved}
      />,
    );
    expect(screen.getByText('Snapshot sample')).toBeInTheDocument();
    expect(screen.queryByText('Changed live sample')).not.toBeInTheDocument();
    expect(screen.queryByText('Renamed live brand')).not.toBeInTheDocument();
    field.applyActionDefault = 'preserve';
    rerender(
      <BrandKitLocalPreview
        brand={changedBrand}
        content={null}
        approvedContent={approved}
      />,
    );
    expect(screen.getByText('Snapshot sample')).toBeInTheDocument();
  });
  it('does not offer an approved snapshot when none exists', () => {
    render(
      <BrandKitLocalPreview
        brand={brand}
        content={null}
        approvedContent={null}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Approved' })).toBeDisabled();
    expect(screen.getByText('Saved live sample')).toBeInTheDocument();
  });
});

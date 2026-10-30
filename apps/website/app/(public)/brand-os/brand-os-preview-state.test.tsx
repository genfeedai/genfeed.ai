import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  BRAND_OS_PREVIEW_STATES,
  BrandOSPreviewState,
} from './brand-os-preview-state';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const draft: IBrandKitDraft = {
  assetCandidates: [],
  brandId: 'brand-os-preview-synthetic',
  diagnostics: [
    {
      code: 'palette-unverified',
      message: 'Candidate palette lacks an exact reference match.',
      severity: 'warning',
    },
  ],
  evidence: [
    {
      excerpt: 'Public category and product promise',
      label: 'Example site',
      sourceType: 'website',
      url: 'https://example.com',
    },
  ],
  fields: {
    description: {
      applyActionDefault: 'accept',
      confidence: 0.98,
      diagnostics: [],
      evidence: [{ label: 'Example site', sourceType: 'website' }],
      group: 'profile',
      key: 'description',
      label: 'Category',
      ownerPath: 'brand.description',
      proposedValue: 'Open-source content tooling.',
    },
    voiceTone: {
      applyActionDefault: 'accept',
      diagnostics: [],
      evidence: [],
      group: 'voice',
      key: 'voiceTone',
      label: 'Voice',
      ownerPath: 'brand.agentConfig.voice.tone',
      proposedValue: 'Direct and technical.',
    },
  },
  id: 'brand-os-preview-synthetic',
  readiness: {
    diagnostics: [
      {
        code: 'no-proof',
        message: 'No customer proof was found in the scanned sources.',
        severity: 'info',
      },
    ],
    missingFields: [],
    requiredFields: [],
    score: 80,
    status: 'partial',
  },
  sourceType: 'website',
  status: 'partial',
};

describe('BrandOSPreviewState', () => {
  it('renders every defined Brand OS state as an explicit presentational state', () => {
    for (const state of BRAND_OS_PREVIEW_STATES) {
      const { container, unmount } = render(
        <BrandOSPreviewState state={state} />,
      );

      expect(
        container.querySelector(`[data-brand-os-state="${state}"]`),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it('shows no evidence until a draft exists', () => {
    render(<BrandOSPreviewState state="idle" />);

    expect(
      screen.queryByRole('heading', { name: 'Source rows' }),
    ).not.toBeInTheDocument();
  });

  it('labels evidence provenance, confidence, source rows, and diagnostics', () => {
    render(<BrandOSPreviewState draft={draft} state="ready" />);

    for (const label of ['extracted', 'inferred']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    expect(screen.getByText('Confidence: 98%')).toBeInTheDocument();
    expect(screen.getByText('Confidence: not scored')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Source rows' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Example site/i })).toHaveAttribute(
      'href',
      'https://example.com',
    );
    expect(
      screen.getByRole('heading', { name: 'Diagnostics' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Candidate palette lacks an exact reference match/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No customer proof was found/i),
    ).toBeInTheDocument();
  });

  it('announces scanning progress politely and errors assertively', () => {
    const { rerender } = render(
      <BrandOSPreviewState announce state="scanning" />,
    );

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');

    rerender(<BrandOSPreviewState announce state="error" />);

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });
});

import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  BRAND_OS_PREVIEW_STATES,
  BrandOSPreviewState,
  BrandOSPreviewStateCatalog,
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

describe('BrandOSPreviewState', () => {
  it('renders every defined Brand OS state as an explicit presentational state', () => {
    const { container } = render(<BrandOSPreviewStateCatalog />);

    for (const state of BRAND_OS_PREVIEW_STATES) {
      expect(
        container.querySelector(`[data-brand-os-state="${state}"]`),
      ).toBeInTheDocument();
    }
  });

  it('labels evidence provenance, confidence, source rows, and diagnostics', () => {
    render(<BrandOSPreviewState showEvidence state="ready" />);

    for (const label of ['extracted', 'inferred', 'candidate', 'missing']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    expect(screen.getByText('Confidence: 98%')).toBeInTheDocument();
    expect(screen.getByText('Confidence: not scored')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Source rows' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /DESIGN\.md/i })).toHaveAttribute(
      'href',
      'https://github.com/genfeedai/genfeed.ai/blob/master/DESIGN.md',
    );
    expect(
      screen.getByRole('heading', { name: 'Diagnostics' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Current product color tokens remain unchanged/i),
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

  it('keeps candidate palettes visibly separate from product tokens', () => {
    render(<BrandOSPreviewState showEvidence state="ready" />);

    expect(
      screen.getByText(/Exploration only — not Genfeed product tokens/i),
    ).toBeInTheDocument();
    expect(screen.getByText('candidate')).toBeInTheDocument();
  });
});

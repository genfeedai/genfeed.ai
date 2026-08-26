import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandOsFunnel } from './brand-os-funnel';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  previewBrandOs: vi.fn(),
}));

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

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({ previewBrandOs: mocks.previewBrandOs }),
  },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apps: { app: 'https://app.genfeed.ai' } },
}));

vi.mock('../../../packages/analytics/posthog-client', () => ({
  captureWebsiteAnalyticsEvent: mocks.capture,
}));

const preview = {
  draft: {
    assetCandidates: [],
    brandId: 'brand-os-preview-synthetic',
    diagnostics: [],
    evidence: [],
    fields: {},
    id: 'brand-os-preview-synthetic',
    readiness: {
      diagnostics: [],
      missingFields: [],
      requiredFields: [],
      score: 100,
      status: 'complete',
    },
    sourceType: 'manual',
    status: 'ready',
  },
  expiresAt: '2026-08-26T12:00:00.000Z',
  id: 'brand-os-preview-synthetic',
  previewToken: 'a'.repeat(43),
};

describe('BrandOsFunnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.previewBrandOs.mockResolvedValue(preview);
  });

  it('submits bounded manual guidance and hands off only the opaque token', async () => {
    render(<BrandOsFunnel />);
    fireEvent.change(screen.getByLabelText('Manual brand guidance'), {
      target: { value: 'Direct, useful, evidence-backed brand guidance.' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Build Brand OS preview' }),
    );

    await waitFor(() => {
      expect(mocks.previewBrandOs).toHaveBeenCalledWith({
        guidance: 'Direct, useful, evidence-backed brand guidance.',
      });
    });

    const signup = await screen.findByRole('link', {
      name: 'Create workspace and save',
    });
    expect(signup.getAttribute('href')).toContain(
      `brandOsToken=${'a'.repeat(43)}`,
    );
    expect(signup.getAttribute('href')).not.toContain('Direct');
    expect(signup).toHaveAttribute('data-ph-no-capture');
    expect(
      signup.closest('[data-brand-os-state="conversion-prompted"]'),
    ).toBeInTheDocument();
    expect(mocks.capture).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ guidance: expect.anything() }),
    );
  });

  it('keeps URL and manual intake mutually exclusive', () => {
    render(<BrandOsFunnel />);
    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.change(screen.getByLabelText('Manual brand guidance'), {
      target: { value: 'Manual direction' },
    });
    expect(screen.getByLabelText('Website URL')).toHaveValue('');
  });
});

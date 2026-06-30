import type { IBrandKitDraft } from '@genfeedai/interfaces';
import BrandDetailManualKitCard from '@pages/brands/components/sidebar/BrandDetailManualKitCard';
import type { BrandDetailManualKitCardProps } from '@props/pages/brand-detail.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createManualBrandKitDraftMock = vi.fn();
const patchMock = vi.fn().mockResolvedValue({});
const updateAgentConfigMock = vi.fn().mockResolvedValue(undefined);
const successMock = vi.fn();
const errorMock = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    createManualBrandKitDraft: createManualBrandKitDraftMock,
    patch: patchMock,
    updateAgentConfig: updateAgentConfigMock,
  }),
}));

vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: errorMock,
      success: successMock,
    }),
  },
}));

function createDraft(overrides: Partial<IBrandKitDraft> = {}): IBrandKitDraft {
  return {
    assetCandidates: [],
    brandId: 'brand-1',
    diagnostics: [],
    evidence: [],
    fields: {},
    readiness: {
      diagnostics: [],
      missingFields: [],
      requiredFields: [],
      score: 100,
      status: 'complete',
    },
    sourceType: 'manual',
    status: 'ready',
    ...overrides,
  };
}

describe('BrandDetailManualKitCard', () => {
  const onRefreshBrand = vi.fn().mockResolvedValue(undefined);
  const props: BrandDetailManualKitCardProps = {
    brand: {
      agentConfig: {
        voice: {
          style: 'plainspoken',
          values: ['proof'],
        },
      },
      banner: { id: 'banner-1' },
      bannerUrl: 'https://assets.example.com/banner.png',
      description: '',
      id: 'brand-1',
      label: 'Acme',
      logo: { id: 'logo-1' },
      logoUrl: 'https://assets.example.com/logo.png',
      primaryColor: '',
      references: [{ id: 'reference-1' }],
      scope: 'BRAND',
    } as BrandDetailManualKitCardProps['brand'],
    brandId: 'brand-1',
    onRefreshBrand,
    onUploadBanner: vi.fn(),
    onUploadLogo: vi.fn(),
    onUploadReference: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    createManualBrandKitDraftMock.mockResolvedValue(createDraft());
  });

  it('creates a manual draft with current assets and typed guidance', async () => {
    createManualBrandKitDraftMock.mockResolvedValue(
      createDraft({
        assetCandidates: [
          {
            candidateId: 'logo:logo-1',
            id: 'logo-1',
            role: 'logo',
            sourceType: 'manual',
          },
        ],
        fields: {
          description: {
            applyActionDefault: 'preserve',
            diagnostics: [],
            evidence: [],
            group: 'profile',
            key: 'description',
            label: 'Description',
            ownerPath: 'brand.description',
            proposedValue: 'Manual description',
          },
        },
      }),
    );

    render(<BrandDetailManualKitCard {...props} />);

    fireEvent.change(screen.getByLabelText('Manual brand description'), {
      target: { value: 'Manual description' },
    });
    fireEvent.change(screen.getByLabelText('Manual brand guidance'), {
      target: { value: 'Write with practical proof.' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /create manual draft/i }),
    );

    await waitFor(() => {
      expect(createManualBrandKitDraftMock).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({
          assets: expect.arrayContaining([
            expect.objectContaining({ id: 'logo-1', role: 'logo' }),
            expect.objectContaining({ id: 'banner-1', role: 'banner' }),
            expect.objectContaining({ id: 'reference-1', role: 'reference' }),
          ]),
          description: 'Manual description',
          guidanceText: 'Write with practical proof.',
        }),
      );
    });
    expect(screen.getByTestId('manual-kit-draft-review')).toBeInTheDocument();
    expect(successMock).toHaveBeenCalledWith('Manual brand kit draft ready');
  });

  it('rejects unsupported guidance files before creating a draft', () => {
    render(<BrandDetailManualKitCard {...props} />);

    fireEvent.change(screen.getByLabelText('Upload guidance file'), {
      target: {
        files: [new File(['guidance'], 'brand-guide.pdf')],
      },
    });

    expect(screen.getByText('Unsupported guidance file type.')).toBeVisible();
    expect(createManualBrandKitDraftMock).not.toHaveBeenCalled();
  });

  it('applies selected brand and voice fields from the draft', async () => {
    createManualBrandKitDraftMock.mockResolvedValue(
      createDraft({
        fields: {
          description: {
            applyActionDefault: 'preserve',
            diagnostics: [],
            evidence: [],
            group: 'profile',
            key: 'description',
            label: 'Description',
            ownerPath: 'brand.description',
            proposedValue: 'Manual description',
          },
          promptGuidelines: {
            applyActionDefault: 'preserve',
            diagnostics: [],
            evidence: [],
            group: 'voice',
            key: 'promptGuidelines',
            label: 'Brand guidance',
            ownerPath: 'brand.text',
            proposedValue: 'Write with proof.',
          },
          voiceTone: {
            applyActionDefault: 'preserve',
            diagnostics: [],
            evidence: [],
            group: 'voice',
            key: 'voiceTone',
            label: 'Voice tone',
            ownerPath: 'brand.agentConfig.voice.tone',
            proposedValue: 'confident',
          },
        },
      }),
    );

    render(<BrandDetailManualKitCard {...props} />);

    fireEvent.change(screen.getByLabelText('Manual brand guidance'), {
      target: { value: 'Write with proof.' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /create manual draft/i }),
    );

    await screen.findByTestId('manual-kit-draft-review');
    fireEvent.click(screen.getByRole('button', { name: /apply selected/i }));

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalledWith('brand-1', {
        description: 'Manual description',
        text: 'Write with proof.',
      });
    });
    expect(updateAgentConfigMock).toHaveBeenCalledWith('brand-1', {
      voice: {
        style: 'plainspoken',
        tone: 'confident',
        values: ['proof'],
      },
    });
    expect(onRefreshBrand).toHaveBeenCalled();
  });
});

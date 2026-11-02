import { buildPublicPreviewBrand } from '@api/collections/content-previews/services/content-preview-brand.util';
import type { IWarmupPreparation } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const brand = {
  agentConfig: {
    voice: {
      audience: ['Founders'],
      style: 'Plain and direct',
      tone: 'Warm',
      values: ['Honesty'],
    },
  },
  description: 'We make invoices simple.',
  label: 'Acme',
  primaryColor: '#112233',
  secondaryColor: '#FFFFFF',
};

describe('buildPublicPreviewBrand', () => {
  it('shows only the name before the context was reviewed', () => {
    expect(buildPublicPreviewBrand(brand, undefined)).toEqual({
      name: 'Acme',
    });
    expect(
      buildPublicPreviewBrand(brand, {
        appliedContextFields: ['description'],
      }),
    ).toEqual({ name: 'Acme' });
  });

  it('shows the fields the operator accepted and omits the rest', () => {
    const preparation: IWarmupPreparation = {
      appliedContextFields: ['description', 'voiceTone', 'primaryColor'],
      contextReviewedAt: '2026-11-02T10:00:00.000Z',
    };

    expect(buildPublicPreviewBrand(brand, preparation)).toEqual({
      description: 'We make invoices simple.',
      name: 'Acme',
      primaryColor: '#112233',
      tone: 'Warm',
    });
  });

  it('omits an accepted field that has no value instead of showing it empty', () => {
    const preparation: IWarmupPreparation = {
      appliedContextFields: ['description', 'voiceValues'],
      contextReviewedAt: '2026-11-02T10:00:00.000Z',
    };

    expect(
      buildPublicPreviewBrand(
        { ...brand, agentConfig: {}, description: '  ' },
        preparation,
      ),
    ).toEqual({ name: 'Acme' });
  });

  it('only shows the logo when the operator accepted it', () => {
    const accepted: IWarmupPreparation = {
      appliedContextFields: ['logo'],
      contextReviewedAt: '2026-11-02T10:00:00.000Z',
    };
    const notAccepted: IWarmupPreparation = {
      appliedContextFields: ['description'],
      contextReviewedAt: '2026-11-02T10:00:00.000Z',
    };

    expect(
      buildPublicPreviewBrand(brand, accepted, {
        logoUrl: 'https://cdn/logo.png',
      }),
    ).toEqual({ logoUrl: 'https://cdn/logo.png', name: 'Acme' });
    expect(
      buildPublicPreviewBrand(brand, notAccepted, {
        logoUrl: 'https://cdn/logo.png',
      }),
    ).toMatchObject({ name: 'Acme' });
    expect(
      buildPublicPreviewBrand(brand, notAccepted, {
        logoUrl: 'https://cdn/logo.png',
      }),
    ).not.toHaveProperty('logoUrl');
  });

  it('only shows the banner when the operator accepted it', () => {
    const accepted: IWarmupPreparation = {
      appliedContextFields: ['banner'],
      contextReviewedAt: '2026-11-02T10:00:00.000Z',
    };
    const notAccepted: IWarmupPreparation = {
      appliedContextFields: ['logo'],
      contextReviewedAt: '2026-11-02T10:00:00.000Z',
    };
    const assets = { bannerUrl: 'https://cdn/banner.png' };

    expect(buildPublicPreviewBrand(brand, accepted, assets)).toEqual({
      bannerUrl: 'https://cdn/banner.png',
      name: 'Acme',
    });
    expect(buildPublicPreviewBrand(brand, notAccepted, assets)).toEqual({
      name: 'Acme',
    });
  });

  it('for workspaces reviewed before the accepted list existed, shows fields that still equal the reviewed proposal', () => {
    const preparation = {
      context: {
        fields: {
          description: { proposedValue: 'We make invoices simple.' },
          voiceTone: { proposedValue: 'Bold' },
        },
      },
      contextReviewedAt: '2026-11-02T10:00:00.000Z',
    } as unknown as IWarmupPreparation;

    expect(buildPublicPreviewBrand(brand, preparation)).toEqual({
      description: 'We make invoices simple.',
      name: 'Acme',
    });
  });
});

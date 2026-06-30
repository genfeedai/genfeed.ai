import type {
  IBrandKitAssetValue,
  IBrandKitSocialLink,
} from '@genfeedai/interfaces';
import {
  type BrandKitSourceBrand,
  buildBrandKitDraftFromBrand,
  buildBrandKitDraftFromWebsiteScrape,
  computeBrandKitReadiness,
} from '@helpers/brand-kit-contract.helper';

function createCompleteBrand(): BrandKitSourceBrand {
  return {
    agentConfig: {
      strategy: {
        contentTypes: ['post', 'article'],
        frequency: 'weekly',
        goals: ['pipeline'],
        platforms: ['linkedin', 'x'],
      },
      voice: {
        audience: ['founders', 'operators'],
        doNotSoundLike: ['generic'],
        messagingPillars: ['speed', 'taste'],
        sampleOutput: 'Ship the sharp version.',
        style: 'concise',
        tone: 'direct',
        values: ['clarity', 'momentum'],
      },
    },
    backgroundColor: '#ffffff',
    banner: {
      id: 'banner-asset',
      label: 'Launch banner',
      url: 'https://cdn.example.com/banner.png',
    },
    description: 'An operator-first content OS.',
    fontFamily: 'Inter',
    id: 'brand-1',
    label: 'Acme',
    links: [
      {
        category: 'website',
        label: 'Website',
        url: 'https://acme.example',
      },
    ],
    logo: {
      id: 'logo-asset',
      label: 'Primary logo',
      mimeType: 'image/png',
      url: 'https://cdn.example.com/logo.png',
    },
    organization: { id: 'org-1' },
    primaryColor: '#ff5500',
    references: [
      {
        id: 'ref-asset',
        label: 'Reference',
        url: 'https://cdn.example.com/ref.png',
      },
    ],
    secondaryColor: '#111827',
    text: 'Use short, grounded copy with explicit proof.',
    twitterUrl: 'https://x.com/acme',
  };
}

describe('brand kit contract helpers', () => {
  it('maps an existing brand into the shared brand kit draft contract', () => {
    const draft = buildBrandKitDraftFromBrand(createCompleteBrand(), {
      draftId: 'draft-1',
    });

    expect(draft.id).toBe('draft-1');
    expect(draft.brandId).toBe('brand-1');
    expect(draft.organizationId).toBe('org-1');
    expect(draft.status).toBe('ready');
    expect(draft.readiness.status).toBe('complete');
    expect(draft.readiness.score).toBe(100);

    expect(draft.fields.label?.currentValue).toBe('Acme');
    expect(draft.fields.promptGuidelines?.ownerPath).toBe('brand.text');
    expect(draft.fields.promptGuidelines?.currentValue).toBe(
      'Use short, grounded copy with explicit proof.',
    );
    expect(draft.fields.voiceAudience?.currentValue).toEqual([
      'founders',
      'operators',
    ]);

    const logo = draft.fields.logo?.currentValue as
      | IBrandKitAssetValue
      | undefined;
    expect(logo).toMatchObject({
      id: 'logo-asset',
      role: 'logo',
      sourceType: 'current_brand',
      url: 'https://cdn.example.com/logo.png',
    });

    const references = draft.fields.references?.currentValue as
      | IBrandKitAssetValue[]
      | undefined;
    expect(references).toHaveLength(1);
    expect(references?.[0]).toMatchObject({
      id: 'ref-asset',
      role: 'reference',
    });

    const socialLinks = draft.fields.socialLinks?.currentValue as
      | IBrandKitSocialLink[]
      | undefined;
    expect(socialLinks).toEqual([
      {
        platform: 'twitter',
        sourceType: 'current_brand',
        url: 'https://x.com/acme',
      },
      {
        label: 'Website',
        platform: 'website',
        sourceType: 'current_brand',
        url: 'https://acme.example',
      },
    ]);
  });

  it('documents every field owner and preserves existing data by default', () => {
    const draft = buildBrandKitDraftFromBrand(createCompleteBrand());
    const fields = Object.values(draft.fields);

    expect(fields).toHaveLength(22);
    expect(
      fields.every((field) => field.applyActionDefault === 'preserve'),
    ).toBe(true);
    expect(draft.fields.primaryColor?.ownerPath).toBe('brand.primaryColor');
    expect(draft.fields.voiceTone?.ownerPath).toBe(
      'brand.agentConfig.voice.tone',
    );
    expect(draft.fields.references?.ownerPath).toBe('brand.references');
  });

  it('reports partial readiness and field diagnostics for missing kit data', () => {
    const readiness = computeBrandKitReadiness({
      id: 'brand-2',
      label: 'Partial',
      primaryColor: '#000000',
    });

    expect(readiness.status).toBe('partial');
    expect(readiness.score).toBeLessThan(100);
    expect(readiness.missingFields).toEqual(
      expect.arrayContaining([
        'description',
        'primaryColor',
        'fontFamily',
        'promptGuidelines',
        'voiceTone',
        'voiceStyle',
        'logo',
        'references',
      ]),
    );
    expect(
      readiness.diagnostics.some(
        (diagnostic) => diagnostic.code === 'brand_kit_missing_primaryColor',
      ),
    ).toBe(true);
  });

  it('marks an empty brand kit as missing', () => {
    const draft = buildBrandKitDraftFromBrand({ id: 'brand-3' });

    expect(draft.status).toBe('missing');
    expect(draft.readiness.status).toBe('missing');
    expect(draft.readiness.score).toBe(0);
    expect(draft.readiness.missingFields).toHaveLength(9);
  });

  it('deduplicates reference asset URLs across references, primaryReferenceUrl, and referenceImages', () => {
    const sharedUrl = 'https://cdn.example.com/shared.png';
    const draft = buildBrandKitDraftFromBrand({
      id: 'brand-dedup',
      primaryReferenceUrl: sharedUrl,
      referenceImages: [sharedUrl, 'https://cdn.example.com/unique.png'],
      references: [{ id: 'ref-1', url: sharedUrl }],
    });

    const references = draft.fields.references?.currentValue as
      | IBrandKitAssetValue[]
      | undefined;
    const urls = references?.map((r) => r.url);
    const uniqueUrls = [...new Set(urls)];
    expect(urls).toHaveLength(uniqueUrls.length);
    expect(references?.some((r) => r.url === sharedUrl)).toBe(true);
    expect(
      references?.some((r) => r.url === 'https://cdn.example.com/unique.png'),
    ).toBe(true);
  });

  it('preserves primaryReferenceUrl as a reference asset when not already in references[]', () => {
    const draft = buildBrandKitDraftFromBrand({
      id: 'brand-primary-ref',
      primaryReferenceUrl: 'https://cdn.example.com/primary.png',
      references: [{ id: 'ref-1', url: 'https://cdn.example.com/other.png' }],
    });

    const references = draft.fields.references?.currentValue as
      | IBrandKitAssetValue[]
      | undefined;
    expect(references).toHaveLength(2);
    expect(
      references?.some((r) => r.url === 'https://cdn.example.com/primary.png'),
    ).toBe(true);
  });

  it('carries blocking diagnostics into the draft readiness state', () => {
    const draft = buildBrandKitDraftFromBrand(createCompleteBrand(), {
      diagnostics: [
        {
          code: 'brand_kit_private_source_blocked',
          fieldKey: 'logo',
          message: 'Private source URL rejected.',
          severity: 'error',
        },
      ],
    });

    expect(draft.status).toBe('blocked');
    expect(draft.readiness.status).toBe('blocked');
    expect(draft.readiness.score).toBe(100);
    expect(draft.readiness.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'brand_kit_private_source_blocked',
          severity: 'error',
        }),
      ]),
    );
  });

  it('maps a website scrape into proposed brand kit fields and asset candidates', () => {
    const draft = buildBrandKitDraftFromWebsiteScrape(createCompleteBrand(), {
      bannerUrl: 'https://acme.example/hero.jpg',
      companyName: 'Acme Website',
      description: 'Website-sourced operating system for creators.',
      fontCandidates: ['Inter', 'Satoshi'],
      logoUrl: 'https://acme.example/logo.svg',
      primaryColor: '#3366ff',
      referenceImageUrls: [
        'https://acme.example/hero.jpg',
        'https://acme.example/reference.jpg',
      ],
      scrapedAt: new Date('2026-06-30T10:00:00Z'),
      socialLinks: {
        linkedin: 'https://linkedin.com/company/acme',
      },
      sourceUrl: 'https://acme.example',
      tagline: 'Create on brand.',
    });

    expect(draft.sourceType).toBe('website');
    expect(draft.fields.label?.currentValue).toBe('Acme');
    expect(draft.fields.label?.proposedValue).toBe('Acme Website');
    expect(draft.fields.primaryColor?.proposedValue).toBe('#3366ff');
    expect(draft.fields.fontFamily?.proposedValue).toBe('Inter');
    expect(draft.fields.promptGuidelines?.proposedValue).toContain(
      'Create on brand.',
    );
    expect(draft.assetCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'logo',
          sourceType: 'website',
          url: 'https://acme.example/logo.svg',
        }),
        expect.objectContaining({
          role: 'banner',
          url: 'https://acme.example/hero.jpg',
        }),
        expect.objectContaining({
          role: 'reference',
          url: 'https://acme.example/reference.jpg',
        }),
      ]),
    );
  });
});

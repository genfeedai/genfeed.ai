import type {
  IBrandKitAssetValue,
  IBrandKitDraft,
  IBrandKitSocialLink,
} from '@genfeedai/contracts/interfaces';
import {
  type BrandKitSourceBrand,
  buildBrandKitDraftFromBrand,
  buildBrandKitDraftFromManualInput,
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
        // Prisma `LinkCategory` label as it arrives on the wire (SCREAMING);
        // `socialLinks[].platform` below must still read lowercase.
        category: 'WEBSITE',
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

    expect(draft.id).toBe('brand-3');
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

  it('maps manual intake fields and uploaded guidance into proposed draft values', () => {
    const draft = buildBrandKitDraftFromManualInput(createCompleteBrand(), {
      description: 'Manual description',
      fontFamily: 'Satoshi',
      guidanceDocumentName: 'brand-guide.md',
      guidanceText: 'Voice: concise and proof-led.',
      primaryColor: '#123456',
      voiceAudience: ['technical founders'],
      voiceStyle: 'plainspoken',
      voiceTone: 'confident',
    });

    expect(draft.sourceType).toBe('manual');
    expect(draft.fields.description?.proposedValue).toBe('Manual description');
    expect(draft.fields.primaryColor?.proposedValue).toBe('#123456');
    expect(draft.fields.fontFamily?.proposedValue).toBe('Satoshi');
    expect(draft.fields.promptGuidelines?.proposedValue).toContain('proof-led');
    expect(draft.fields.voiceTone?.proposedValue).toBe('confident');
    expect(draft.fields.voiceAudience?.proposedValue).toEqual([
      'technical founders',
    ]);
    expect(draft.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Uploaded guidance: brand-guide.md',
          sourceType: 'uploaded_guidance',
        }),
        expect.objectContaining({
          label: 'Manual brand kit intake',
          sourceType: 'manual',
        }),
      ]),
    );
  });

  it('maps assigned manual assets into proposed asset fields and candidates', () => {
    const draft = buildBrandKitDraftFromManualInput(createCompleteBrand(), {
      assets: [
        {
          id: 'logo-upload',
          label: 'Uploaded logo',
          role: 'logo',
          url: 'https://cdn.example.com/logo-upload.png',
        },
        {
          id: 'reference-upload',
          label: 'Uploaded reference',
          role: 'reference',
          url: 'https://cdn.example.com/reference-upload.png',
        },
      ],
    });

    expect(draft.fields.logo?.proposedValue).toMatchObject({
      id: 'logo-upload',
      role: 'logo',
      sourceType: 'manual',
    });
    expect(draft.fields.references?.proposedValue).toEqual([
      expect.objectContaining({
        id: 'reference-upload',
        role: 'reference',
      }),
    ]);
    expect(draft.assetCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ candidateId: 'logo:logo-upload' }),
        expect.objectContaining({ candidateId: 'reference:reference-upload' }),
      ]),
    );
  });
});

function approveLikeRevisionService(draft: IBrandKitDraft): IBrandKitDraft {
  const approved = structuredClone(draft);
  for (const [key, field] of Object.entries(approved.fields)) {
    if (!field) continue;
    if (field.applyActionDefault === 'reject') {
      Reflect.deleteProperty(approved.fields, key);
      continue;
    }
    if (
      field.applyActionDefault === 'accept' &&
      field.proposedValue !== undefined
    )
      field.currentValue = field.proposedValue;
    delete field.proposedValue;
  }
  approved.assetCandidates = [];
  approved.status = 'accepted';
  return approved;
}

describe('approved website baseline authority', () => {
  const scraped = {
    companyName: 'Website B',
    description: 'Website description B',
    fontFamily: 'Website Family',
    logoUrl: 'https://acme.example/new.svg',
    scrapedAt: new Date('2026-10-01T00:00:00Z'),
    sourceUrl: 'https://acme.example',
  };
  it('retains approved fields, asset identities and exact family while keeping fresh proposals separate', () => {
    const brand = createCompleteBrand();
    const baseline = approveLikeRevisionService(
      buildBrandKitDraftFromBrand(brand),
    );
    if (baseline.fields.fontFamily)
      baseline.fields.fontFamily.currentValue = 'Owner Custom Family';
    brand.label = 'Mutable B';
    brand.logo = { id: 'mutable-logo' };
    const before = structuredClone({ brand, baseline, scraped });
    const draft = buildBrandKitDraftFromWebsiteScrape(brand, scraped, {
      baselineDraft: baseline,
      draftId: 'fresh',
      createdAt: 'fresh-time',
      fieldConfidence: { label: 0.8 },
    });
    expect(draft.fields.label).toMatchObject({
      currentValue: 'Acme',
      proposedValue: 'Website B',
      applyActionDefault: 'preserve',
      confidence: 0.8,
    });
    expect(draft.fields.logo?.currentValue).toMatchObject({ id: 'logo-asset' });
    expect(draft.fields.logo?.proposedValue).toMatchObject({
      url: scraped.logoUrl,
    });
    expect(draft.fields.fontFamily?.currentValue).toBe('Owner Custom Family');
    expect(draft.fields.fontFamily?.proposedValue).toBe('Website Family');
    expect(draft.fields.voiceTone?.currentValue).toBe('direct');
    expect(draft.id).toBe('fresh');
    expect(draft.createdAt).toBe('fresh-time');
    expect(draft.sourceType).toBe('website');
    expect(draft.status).toBe('ready');
    expect(draft.evidence.map((e) => e.sourceType)).toEqual([
      'current_brand',
      'website',
    ]);
    expect(draft.fields.label?.evidence.map((e) => e.sourceType)).toEqual([
      'current_brand',
      'website',
    ]);
    expect(draft.assetCandidates).not.toHaveLength(0);
    expect(approveLikeRevisionService(draft).fields.label?.currentValue).toBe(
      'Acme',
    );
    expect(
      approveLikeRevisionService(draft).fields.label?.proposedValue,
    ).toBeUndefined();
    expect({ brand, baseline, scraped }).toEqual(before);
    expect(draft.fields.logo?.currentValue).not.toBe(
      baseline.fields.logo?.currentValue,
    );
    expect(draft.fields.label?.evidence[0]).not.toBe(
      baseline.fields.label?.evidence[0],
    );
  });
  it('does not resurrect intentionally absent values and preserves explicit empty values', () => {
    const baseline = approveLikeRevisionService(
      buildBrandKitDraftFromBrand(createCompleteBrand()),
    );
    delete baseline.fields.voiceTone;
    delete baseline.fields.description;
    if (baseline.fields.label) baseline.fields.label.currentValue = '';
    if (baseline.fields.voiceAudience)
      baseline.fields.voiceAudience.currentValue = [];
    if (baseline.fields.banner) baseline.fields.banner.currentValue = null;
    const draft = buildBrandKitDraftFromWebsiteScrape(
      createCompleteBrand(),
      scraped,
      { baselineDraft: baseline },
    );
    expect(draft.fields.voiceTone?.currentValue).toBeUndefined();
    expect(draft.fields.description?.currentValue).toBeUndefined();
    expect(draft.fields.description?.proposedValue).toBe(scraped.description);
    expect(draft.fields.label?.currentValue).toBe('');
    expect(draft.fields.voiceAudience?.currentValue).toEqual([]);
    expect(draft.fields.banner?.currentValue).toBeNull();
    expect(draft.readiness.missingFields).toContain('voiceTone');
    expect(draft.readiness.missingFields).not.toContain('description');
    expect(draft.status).toBe('partial');
  });
  it.each([
    { brandId: 'foreign' },
    { organizationId: 'foreign' },
    { status: 'ready' as const },
  ])('rejects invalid baseline %s', (change) => {
    const baseline = {
      ...approveLikeRevisionService(
        buildBrandKitDraftFromBrand(createCompleteBrand()),
      ),
      ...change,
    };
    expect(() =>
      buildBrandKitDraftFromWebsiteScrape(createCompleteBrand(), scraped, {
        baselineDraft: baseline,
      }),
    ).toThrow('Invalid brand kit baseline');
  });
  it('clones approved enrichment unchanged and excludes stale baseline diagnostics/assets', () => {
    const baseline = approveLikeRevisionService(
      buildBrandKitDraftFromBrand(createCompleteBrand()),
    );
    baseline.generationRules = {
      schemaVersion: 1,
      evidence: [{ id: 'manual', sourceType: 'manual', label: 'Approved' }],
      facts: [],
      palette: [],
      typography: [
        {
          id: 'font',
          family: 'Owner Custom Family',
          role: 'body',
          weight: 400,
          style: 'normal',
          availability: 'unknown',
          required: true,
          evidenceIds: ['manual'],
        },
      ],
      mandatory: [],
      avoid: [],
      examples: [],
      assets: [],
    };
    baseline.diagnostics = [
      { code: 'stale', message: 'Stale error', severity: 'error' },
    ];
    baseline.assetCandidates = [
      {
        candidateId: 'stale',
        role: 'logo',
        sourceType: 'website',
        url: 'https://old.example/logo',
      },
    ];
    const draft = buildBrandKitDraftFromWebsiteScrape(
      createCompleteBrand(),
      scraped,
      { baselineDraft: baseline },
    );
    expect(draft.generationRules).toEqual(baseline.generationRules);
    expect(draft.generationRules).not.toBe(baseline.generationRules);
    expect(draft.diagnostics.some((d) => d.code === 'stale')).toBe(false);
    expect(draft.assetCandidates.some((a) => a.candidateId === 'stale')).toBe(
      false,
    );
    expect(draft.status).toBe('ready');
  });
  it('leaves the legacy call equivalent with no baseline and ignores baseline in brand/manual projection', () => {
    const brand = createCompleteBrand();
    const baseline = approveLikeRevisionService(
      buildBrandKitDraftFromBrand({ id: 'other' }),
    );
    expect(buildBrandKitDraftFromWebsiteScrape(brand, scraped)).toEqual(
      buildBrandKitDraftFromWebsiteScrape(brand, scraped, {
        baselineDraft: undefined,
      }),
    );
    expect(
      buildBrandKitDraftFromBrand(brand, { baselineDraft: baseline }),
    ).toEqual(buildBrandKitDraftFromBrand(brand));
    expect(
      buildBrandKitDraftFromManualInput(
        brand,
        { label: 'Manual' },
        { baselineDraft: baseline },
      ),
    ).toEqual(buildBrandKitDraftFromManualInput(brand, { label: 'Manual' }));
  });
});

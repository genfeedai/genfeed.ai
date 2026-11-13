import {
  buildDraftsFunnelProperties,
  buildScanFunnelProperties,
} from '@api/endpoints/onboarding/utils/onboarding-funnel-events.util';

describe('buildScanFunnelProperties', () => {
  it('counts what the scan found without carrying any of its text', () => {
    expect(
      buildScanFunnelProperties({
        status: 'scanned',
        summary: {
          description: 'Handmade pans',
          name: 'Acme',
          suggestions: {
            audiences: ['home cooks', 'chefs'],
            competitors: [],
            offers: ['ceramic pans'],
          },
          tone: 'warm',
        },
      }),
    ).toEqual({
      audienceSuggestionCount: 2,
      competitorSuggestionCount: 0,
      hasDescription: true,
      hasLogo: false,
      hasTone: true,
      offerSuggestionCount: 1,
      outcome: 'scanned',
      reason: null,
    });
  });

  it('reports the failure reason when the scan fails', () => {
    expect(
      buildScanFunnelProperties({ reason: 'blocked', status: 'failed' }),
    ).toMatchObject({
      hasDescription: false,
      outcome: 'failed',
      reason: 'blocked',
    });
  });
});

describe('buildDraftsFunnelProperties', () => {
  const draft = (platform: 'twitter' | 'linkedin', text: string) => ({
    isProvisional: false,
    platform,
    postId: 'post',
    receiptId: 'receipt',
    requestKey: 'key',
    text,
  });

  it('records lengths and which drafts are too short, never the text', () => {
    const properties = buildDraftsFunnelProperties(
      {
        drafts: [draft('twitter', 'x'.repeat(120)), draft('linkedin', 'short')],
        imageIngredientId: null,
        imageUrl: 'https://cdn.example.com/a.png',
        requestKey: 'key',
        status: 'partial',
      },
      { hasContext: false, isRedo: true },
    );

    expect(properties).toEqual({
      campaignImageReadyCount: 0,
      draftCount: 2,
      draftLengths: { linkedin: 5, twitter: 120 },
      hasContext: false,
      hasMasterImage: true,
      isRedo: true,
      platforms: ['twitter', 'linkedin'],
      shortDraftCount: 1,
      status: 'partial',
    });
  });

  it('reports a failed run as no drafts', () => {
    expect(
      buildDraftsFunnelProperties(null, { hasContext: true, isRedo: false }),
    ).toMatchObject({ draftCount: 0, status: 'failed' });
  });
});

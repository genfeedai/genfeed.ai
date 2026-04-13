import { ContentRunSource, ContentRunStatus } from '@genfeedai/enums';
import { ContentRunSerializer } from '@genfeedai/serializers';

describe('ContentRunSerializer', () => {
  it('serializes lifecycle attributes for the expanded content run contract', () => {
    const now = new Date();
    const result = ContentRunSerializer.serialize({
      _id: 'run-1',
      analyticsSummary: {
        engagementRate: 0.19,
        metadata: { window: '7d' },
        summary: 'Founder-led angle won',
        winningVariantId: 'variant-a',
      },
      brand: 'brand-1',
      brief: {
        audience: 'founders',
        hypothesis: 'Specific operator pain beats generic AI framing',
      },
      createdAt: now,
      creditsUsed: 0,
      input: { topic: 'AI strategy' },
      isDeleted: false,
      organization: 'org-1',
      output: {
        content: 'A draft',
        metadata: {},
        platforms: ['twitter'],
        skillSlug: 'content-writing',
        type: 'text',
      },
      publish: {
        experimentId: 'exp-1',
        metadata: { slot: 'morning' },
        platform: 'twitter',
        variantId: 'variant-a',
      },
      recommendations: [
        {
          confidence: 0.78,
          metadata: { source: 'analytics' },
          type: 'repurpose',
        },
      ],
      skillSlug: 'content-writing',
      source: ContentRunSource.HOSTED,
      status: ContentRunStatus.COMPLETED,
      updatedAt: now,
      variants: [
        {
          id: 'variant-a',
          metadata: { hook: 'pain-first' },
          platform: 'twitter',
          status: 'generated',
          type: 'text',
        },
      ],
    });

    expect(result.data.attributes).toHaveProperty('brief');
    expect(result.data.attributes).toHaveProperty('variants');
    expect(result.data.attributes).toHaveProperty('publish');
    expect(result.data.attributes).toHaveProperty('analyticsSummary');
    expect(result.data.attributes).toHaveProperty('recommendations');
    expect(result.data.attributes.brief).toMatchObject({
      audience: 'founders',
      hypothesis: 'Specific operator pain beats generic AI framing',
    });
    expect(result.data.attributes.publish).toMatchObject({
      experimentId: 'exp-1',
      platform: 'twitter',
      variantId: 'variant-a',
    });
    expect(result.data.attributes.analyticsSummary).toMatchObject({
      summary: 'Founder-led angle won',
      winningVariantId: 'variant-a',
    });
  });
});

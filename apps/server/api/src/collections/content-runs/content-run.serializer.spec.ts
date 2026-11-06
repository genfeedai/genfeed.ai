import { singleResourceAttributes } from '@api-test/helpers/json-api-resource';
import { ContentRunSource, ContentRunStatus } from '@genfeedai/contracts';
import { ContentRunSerializer } from '@genfeedai/serializers';

describe('ContentRunSerializer', () => {
  it('serializes lifecycle attributes for the expanded content run contract', () => {
    const now = new Date();
    const result = ContentRunSerializer.serialize({
      id: 'run-1',
      analyticsSummary: {
        engagementRate: 0.19,
        metadata: { window: '7d' },
        summary: 'Founder-led angle won',
        winningVariantId: 'variant-a',
      },
      brandId: 'brand-1',
      brief: {
        audience: 'founders',
        hypothesis: 'Specific operator pain beats generic AI framing',
      },
      createdAt: now,
      creditsUsed: 0,
      input: { topic: 'AI strategy' },
      isDeleted: false,
      organizationId: 'org-1',
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

    const attributes = singleResourceAttributes(result);

    expect(attributes).toHaveProperty('brief');
    expect(attributes).toHaveProperty('variants');
    expect(attributes).toHaveProperty('publish');
    expect(attributes).toHaveProperty('analyticsSummary');
    expect(attributes).toHaveProperty('recommendations');
    expect(attributes).toMatchObject({
      brandId: 'brand-1',
      organizationId: 'org-1',
    });
    expect(attributes.brief).toMatchObject({
      audience: 'founders',
      hypothesis: 'Specific operator pain beats generic AI framing',
    });
    expect(attributes.publish).toMatchObject({
      experimentId: 'exp-1',
      platform: 'twitter',
      variantId: 'variant-a',
    });
    expect(attributes.analyticsSummary).toMatchObject({
      summary: 'Founder-led angle won',
      winningVariantId: 'variant-a',
    });
  });
});

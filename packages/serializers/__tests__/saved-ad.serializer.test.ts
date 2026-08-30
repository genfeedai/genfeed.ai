import { SavedAdSerializer } from '@serializers/server/analytics/saved-ad.serializer';
import { describe, expect, it } from 'vitest';

describe('saved ad serializer', () => {
  it('serializes copied media, evidence, and note without relations', () => {
    const output = SavedAdSerializer.serialize({
      brandId: 'brand-1',
      id: 'saved-1',
      imageUrls: ['https://files.example/saved.jpg'],
      metrics: { ctr: 2.1 },
      note: 'Adapt this hook',
      organizationId: 'org-1',
      patternSummary: [{ label: 'Hook', summary: 'Fast proof' }],
      platform: 'meta',
      sourceAdId: 'source-1',
      userId: 'opaque-user',
      videoUrls: [],
    }) as { data: { attributes: Record<string, unknown>; id: string } };

    expect(output.data.id).toBe('saved-1');
    expect(output.data.attributes).toMatchObject({
      brandId: 'brand-1',
      imageUrls: ['https://files.example/saved.jpg'],
      note: 'Adapt this hook',
      sourceAdId: 'source-1',
    });
  });
});

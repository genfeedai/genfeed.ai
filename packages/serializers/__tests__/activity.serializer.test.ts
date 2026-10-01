import { ActivitySerializer } from '@serializers/server/common/activity.serializer';
import { describe, expect, it } from 'vitest';

describe('activity ingredient relationship', () => {
  it('includes the generated asset and metadata so clients can inspect it', () => {
    const result = ActivitySerializer.serialize({
      id: 'activity-1',
      key: 'image-generated',
      ingredient: {
        id: 'asset-1',
        category: 'IMAGE',
        status: 'GENERATED',
        metadata: { id: 'metadata-1', label: 'Created image' },
      },
    });
    expect(result).toMatchObject({
      data: {
        relationships: {
          ingredient: { data: { type: 'ingredient', id: 'asset-1' } },
        },
      },
      included: expect.arrayContaining([
        expect.objectContaining({
          type: 'ingredient',
          id: 'asset-1',
          attributes: expect.objectContaining({ status: 'GENERATED' }),
          relationships: {
            metadata: { data: { type: 'metadata', id: 'metadata-1' } },
          },
        }),
        expect.objectContaining({
          type: 'metadata',
          id: 'metadata-1',
          attributes: expect.objectContaining({ label: 'Created image' }),
        }),
      ]),
    });
  });
});

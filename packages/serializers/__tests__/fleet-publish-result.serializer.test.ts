import { FleetPublishResultSerializer } from '@serializers/server/admin/fleet-publish-result.serializer';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@genfeedai/helpers',
  async () => import('../../helpers/src/serializer.helper'),
);

describe('FleetPublishResultSerializer', () => {
  it('serializes the complete per-platform publish result contract', () => {
    const output = FleetPublishResultSerializer.serialize({
      id: 'publish:asset-1',
      privateInternalValue: 'must-not-leak',
      results: {
        instagram: { id: 'instagram-1', success: true },
        twitter: { error: 'rate limited', success: false },
      },
      success: false,
    }) as {
      data: {
        attributes: Record<string, unknown>;
        id: string;
        type: string;
      };
    };

    expect(output.data).toMatchObject({
      attributes: {
        results: {
          instagram: { id: 'instagram-1', success: true },
          twitter: { error: 'rate limited', success: false },
        },
        success: false,
      },
      id: 'publish:asset-1',
      type: 'fleet-publish-result',
    });
    expect(output.data.attributes).not.toHaveProperty('privateInternalValue');
  });
});

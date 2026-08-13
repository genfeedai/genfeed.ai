import { livestreamBotSessionAttributes } from '@serializers/attributes/automation/livestream-bot-session.attributes';
import { LivestreamBotSessionSerializer } from '@serializers/server/automation/livestream-bot-session.serializer';
import { describe, expect, it } from 'vitest';

describe('LivestreamBotSessionSerializer canonical identity contract', () => {
  it('emits scalar ids without Mongo-era aliases', () => {
    const output = LivestreamBotSessionSerializer.serialize({
      _id: 'legacy-session-id',
      bot: 'bot-1',
      brand: 'legacy-brand',
      brandId: 'brand-1',
      id: 'session-1',
      organization: 'legacy-organization',
      organizationId: 'organization-1',
      status: 'stopped',
      user: 'legacy-user',
      userId: 'user-1',
    }) as {
      data: {
        attributes: Record<string, unknown>;
        id: string;
      };
    };

    expect(livestreamBotSessionAttributes).toEqual(
      expect.arrayContaining(['brandId', 'organizationId', 'userId']),
    );
    expect(output.data.id).toBe('session-1');
    expect(output.data.attributes).toMatchObject({
      brandId: 'brand-1',
      organizationId: 'organization-1',
      userId: 'user-1',
    });
    expect(output.data.attributes).not.toHaveProperty('_id');
    expect(output.data.attributes).not.toHaveProperty('brand');
    expect(output.data.attributes).not.toHaveProperty('organization');
    expect(output.data.attributes).not.toHaveProperty('user');
  });
});

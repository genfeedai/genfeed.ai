import { botAttributes } from '@serializers/attributes/automation/bot.attributes';
import { BotSerializer } from '@serializers/server/automation/bot.serializer';
import { describe, expect, it } from 'vitest';

describe('BotSerializer canonical identity contract', () => {
  it('emits scalar ids without Mongo-era aliases', () => {
    const output = BotSerializer.serialize({
      _id: 'legacy-bot-id',
      brand: 'legacy-brand',
      brandId: 'brand-1',
      category: 'chat',
      id: 'bot-1',
      label: 'Livestream Chat Bot',
      organization: 'legacy-organization',
      organizationId: 'organization-1',
      status: 'active',
      user: 'legacy-user',
      userId: 'user-1',
    }) as {
      data: {
        attributes: Record<string, unknown>;
        id: string;
      };
    };

    expect(botAttributes).toEqual(
      expect.arrayContaining(['brandId', 'organizationId', 'userId']),
    );
    expect(output.data.id).toBe('bot-1');
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

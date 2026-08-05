import { botActivityAttributes } from '@serializers/attributes/automation/bot-activity.attributes';
import { BotActivitySerializer } from '@serializers/server/automation/bot-activity.serializer';
import { describe, expect, it } from 'vitest';

describe('BotActivitySerializer canonical identity contract', () => {
  it('emits scalar ids without Mongo-era aliases', () => {
    const output = BotActivitySerializer.serialize({
      _id: 'legacy-activity-id',
      brand: 'legacy-brand',
      brandId: 'brand-1',
      id: 'activity-1',
      monitoredAccount: 'legacy-account',
      monitoredAccountId: 'account-1',
      organization: 'legacy-organization',
      organizationId: 'organization-1',
      replyBotConfig: 'legacy-config',
      replyBotConfigId: 'config-1',
      status: 'completed',
      user: 'legacy-user',
      userId: 'user-1',
    }) as {
      data: {
        attributes: Record<string, unknown>;
        id: string;
        relationships?: Record<string, unknown>;
      };
    };

    expect(botActivityAttributes).toEqual(
      expect.arrayContaining([
        'brandId',
        'monitoredAccountId',
        'organizationId',
        'replyBotConfigId',
        'userId',
      ]),
    );
    expect(output.data.id).toBe('activity-1');
    expect(output.data.attributes).toMatchObject({
      brandId: 'brand-1',
      monitoredAccountId: 'account-1',
      organizationId: 'organization-1',
      replyBotConfigId: 'config-1',
      userId: 'user-1',
    });
    expect(output.data.attributes).not.toHaveProperty('_id');
    expect(output.data.attributes).not.toHaveProperty('brand');
    expect(output.data.attributes).not.toHaveProperty('monitoredAccount');
    expect(output.data.attributes).not.toHaveProperty('organization');
    expect(output.data.attributes).not.toHaveProperty('replyBotConfig');
    expect(output.data.attributes).not.toHaveProperty('user');
    expect(output.data.relationships).toBeUndefined();
  });
});

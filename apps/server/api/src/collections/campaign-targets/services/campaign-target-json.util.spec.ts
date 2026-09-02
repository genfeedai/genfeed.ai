import {
  hydrateCampaignTargetJson,
  mergeCampaignTargetJson,
  parseJsonObject,
  splitCampaignTargetPatch,
  toCampaignTargetDataPayload,
} from '@api/collections/campaign-targets/services/campaign-target-json.util';

describe('campaign-target JSON boundary', () => {
  it('hydrates typed JSON fields including ISO dates', () => {
    const sentAt = '2026-08-24T12:00:00.000Z';

    const hydrated = hydrateCampaignTargetJson({
      campaignId: 'campaign-1',
      data: {
        dmSentAt: sentAt,
        dmText: 'hello',
        recipientUserId: 'user-9',
      },
      id: 'target-1',
      organizationId: 'org-1',
    });

    expect(hydrated.dmText).toBe('hello');
    expect(hydrated.recipientUserId).toBe('user-9');
    expect(hydrated.dmSentAt).toEqual(new Date(sentAt));
  });

  it('writes JSON-only fields into the data document, not columns', () => {
    const { columns, json } = splitCampaignTargetPatch({
      dmSentAt: new Date('2026-08-24T12:00:00.000Z'),
      dmText: 'shipped',
      processedAt: new Date('2026-08-24T12:01:00.000Z'),
      recipientUserId: 'user-9',
      status: 'SENT',
    });

    expect(columns).toEqual({
      processedAt: new Date('2026-08-24T12:01:00.000Z'),
      status: 'SENT',
    });
    expect(json).toEqual({
      dmSentAt: new Date('2026-08-24T12:00:00.000Z'),
      dmText: 'shipped',
      recipientUserId: 'user-9',
    });
  });

  it('round-trips typed JSON through the Prisma JSON payload', () => {
    const sentAt = new Date('2026-08-24T12:00:00.000Z');
    const merged = mergeCampaignTargetJson(
      { authorUsername: 'alice' },
      {
        dmSentAt: sentAt,
        dmText: 'hello',
        recipientUserId: 'user-9',
      },
    );

    expect(merged).toEqual({
      authorUsername: 'alice',
      dmSentAt: sentAt.toISOString(),
      dmText: 'hello',
      recipientUserId: 'user-9',
    });

    const hydrated = hydrateCampaignTargetJson({
      data: merged,
      id: 'target-1',
    });

    expect(hydrated.authorUsername).toBe('alice');
    expect(hydrated.dmText).toBe('hello');
    expect(hydrated.recipientUserId).toBe('user-9');
    expect(hydrated.dmSentAt).toEqual(sentAt);
  });

  it('serializes create details without Date or undefined values', () => {
    expect(
      toCampaignTargetDataPayload({
        authorUsername: 'alice',
        campaignId: 'campaign-1',
        contentCreatedAt: new Date('2026-08-24T12:00:00.000Z'),
        dmText: undefined,
        organizationId: 'org-1',
      }),
    ).toEqual({
      authorUsername: 'alice',
      contentCreatedAt: '2026-08-24T12:00:00.000Z',
    });
  });

  it('parses object and JSON-string config payloads', () => {
    expect(parseJsonObject({ totalTargets: 2 })).toEqual({ totalTargets: 2 });
    expect(parseJsonObject('{"totalTargets":3}')).toEqual({ totalTargets: 3 });
    expect(parseJsonObject('not-json')).toEqual({});
  });
});

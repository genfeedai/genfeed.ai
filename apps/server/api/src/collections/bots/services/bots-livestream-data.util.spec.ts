import {
  mergeLivestreamSessionContext,
  normalizeLivestreamBotDocument,
  normalizeLivestreamSessionDocument,
  serializeLivestreamSessionData,
} from '@api/collections/bots/services/bots-livestream-data.util';
import { describe, expect, it } from 'vitest';

describe('bots-livestream-data.util', () => {
  it('hydrates bot JSON while preserving row precedence and valid records', () => {
    const bot = normalizeLivestreamBotDocument({
      brandId: 'brand-row',
      config: {
        brandId: 'brand-config',
        description: 'from-config',
      },
      livestreamSettings: {
        links: [
          { id: 'link-1', label: 'Launch', url: 'https://example.com' },
          { id: 'invalid-link', label: 'Missing URL' },
        ],
        messageTemplates: [
          {
            enabled: false,
            id: 'template-1',
            platforms: ['twitch', 42],
            text: 'Visit {{link_url}}',
            type: 'scheduled_link_drop',
          },
          {
            id: 'invalid-template',
            text: 'Unknown',
            type: 'unsupported',
          },
        ],
      },
      settings: {
        description: 'from-settings',
      },
      targets: [
        {
          channelId: 'channel-1',
          isEnabled: true,
          platform: 'twitch',
        },
        { channelId: 'missing-platform' },
      ],
    } as never);

    expect(bot).toMatchObject({
      brandId: 'brand-row',
      description: 'from-config',
      livestreamSettings: {
        links: [{ id: 'link-1', label: 'Launch', url: 'https://example.com' }],
        messageTemplates: [
          {
            enabled: false,
            id: 'template-1',
            platforms: ['twitch'],
            text: 'Visit {{link_url}}',
            type: 'scheduled_link_drop',
          },
        ],
      },
      targets: [
        {
          channelId: 'channel-1',
          isEnabled: true,
          platform: 'twitch',
        },
      ],
    });
  });

  it('hydrates persisted session data and omits malformed collection entries', () => {
    const session = normalizeLivestreamSessionDocument({
      data: {
        context: {
          manualOverride: {
            expiresAt: '2026-08-19T00:00:00.000Z',
            topic: 'Launch',
          },
          source: 'manual_override',
        },
        deliveryHistory: [
          {
            createdAt: '2026-08-19T00:01:00.000Z',
            id: 'delivery-1',
            message: 'Hello',
            platform: 'youtube',
            status: 'sent',
            type: 'scheduled_host_prompt',
          },
          { id: 'invalid-delivery' },
        ],
        platformStates: [
          {
            hourWindowStartedAt: '2026-08-19T00:00:00.000Z',
            platform: 'youtube',
          },
          { hourlyPostCount: 3 },
        ],
        startedAt: '2026-08-19T00:00:00.000Z',
        status: 'active',
        transcriptChunks: [
          {
            createdAt: '2026-08-19T00:02:00.000Z',
            text: 'Current topic',
          },
          { confidence: 0.5 },
        ],
      },
      id: 'session-1',
      status: 'paused',
    });

    expect(session.status).toBe('paused');
    expect(session.startedAt).toEqual(new Date('2026-08-19T00:00:00.000Z'));
    expect(session.context).toMatchObject({
      manualOverride: {
        expiresAt: new Date('2026-08-19T00:00:00.000Z'),
        topic: 'Launch',
      },
      source: 'manual_override',
    });
    expect(session.platformStates).toEqual([
      {
        hourWindowStartedAt: new Date('2026-08-19T00:00:00.000Z'),
        hourlyPostCount: 0,
        lastError: undefined,
        lastPostedAt: undefined,
        platform: 'youtube',
      },
    ]);
    expect(session.deliveryHistory).toHaveLength(1);
    expect(session.transcriptChunks).toHaveLength(1);
  });

  it('serializes session dates and removes undefined object properties', () => {
    expect(
      serializeLivestreamSessionData({
        context: {
          currentTopic: undefined,
          manualOverride: {
            expiresAt: new Date('2026-08-19T00:15:00.000Z'),
          },
          source: 'manual_override',
        },
        deliveryHistory: [],
        platformStates: [],
        startedAt: new Date('2026-08-19T00:00:00.000Z'),
        status: 'active',
        transcriptChunks: [],
      }),
    ).toEqual({
      context: {
        manualOverride: {
          expiresAt: '2026-08-19T00:15:00.000Z',
        },
        source: 'manual_override',
      },
      deliveryHistory: [],
      lastTranscriptAt: null,
      pausedAt: null,
      platformStates: [],
      startedAt: '2026-08-19T00:00:00.000Z',
      status: 'active',
      stoppedAt: null,
      transcriptChunks: [],
    });
  });

  it('merges session context without dropping the current source', () => {
    expect(
      mergeLivestreamSessionContext(
        {
          currentTopic: 'Original',
          source: 'transcript',
        },
        { promotionAngle: 'Launch' },
      ),
    ).toEqual({
      currentTopic: 'Original',
      promotionAngle: 'Launch',
      source: 'transcript',
    });
  });
});

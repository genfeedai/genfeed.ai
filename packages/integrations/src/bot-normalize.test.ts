import { describe, expect, it } from 'vitest';

import { normalizeIntegration, normalizeIntegrations } from './bot-normalize';

describe('normalizeIntegration', () => {
  it('returns null for null payload', () => {
    expect(normalizeIntegration(null, 'discord')).toBeNull();
  });

  it('returns null for non-object payload', () => {
    expect(normalizeIntegration('string', 'discord')).toBeNull();
    expect(normalizeIntegration(42, 'discord')).toBeNull();
    expect(normalizeIntegration(undefined, 'discord')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(normalizeIntegration({}, 'discord')).toBeNull();
    expect(normalizeIntegration({ id: 'x' }, 'discord')).toBeNull();
    expect(normalizeIntegration({ id: 'x', orgId: 'o' }, 'discord')).toBeNull();
  });

  it('normalizes a Prisma-style payload with id and orgId', () => {
    const payload = {
      id: 'int-1',
      orgId: 'org-1',
      botToken: 'tok-abc',
      config: { allowedUserIds: ['u1'] },
      status: 'active',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-06-01T00:00:00.000Z',
    };

    const result = normalizeIntegration(payload, 'discord');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('int-1');
    expect(result?.orgId).toBe('org-1');
    expect(result?.botToken).toBe('tok-abc');
    expect(result?.platform).toBe('discord');
    expect(result?.status).toBe('active');
    expect(result?.config.allowedUserIds).toContain('u1');
  });

  it('normalizes a MongoDB-style payload with _id and organization', () => {
    const payload = {
      _id: 'mongo-id-123',
      organization: 'org-mongo-1',
      botToken: 'tok-mongo',
      config: {},
      status: 'active',
    };

    const result = normalizeIntegration(payload, 'telegram');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('mongo-id-123');
    expect(result?.orgId).toBe('org-mongo-1');
    expect(result?.platform).toBe('telegram');
  });

  it('prefers Prisma id over _id when both present', () => {
    const payload = {
      id: 'prisma-id',
      _id: 'mongo-id',
      orgId: 'org-1',
      botToken: 'tok',
    };

    const result = normalizeIntegration(payload, 'slack');
    expect(result?.id).toBe('prisma-id');
  });

  it('defaults status to "active" when absent', () => {
    const payload = {
      id: 'int-1',
      orgId: 'org-1',
      botToken: 'tok',
    };

    const result = normalizeIntegration(payload, 'slack');
    expect(result?.status).toBe('active');
  });

  it('defaults createdAt/updatedAt to now when absent', () => {
    const before = Date.now();
    const payload = { id: 'int-1', orgId: 'org-1', botToken: 'tok' };
    const result = normalizeIntegration(payload, 'discord');
    const after = Date.now();

    expect(result?.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result?.createdAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('defaults config to empty object when absent', () => {
    const payload = { id: 'int-1', orgId: 'org-1', botToken: 'tok' };
    const result = normalizeIntegration(payload, 'telegram');
    expect(result?.config).toEqual({});
  });

  it('defaults config to {} when raw.config is a primitive (number)', () => {
    const payload = {
      id: 'int-1',
      orgId: 'org-1',
      botToken: 'tok',
      config: 42,
    };
    const result = normalizeIntegration(payload, 'discord');
    expect(result?.config).toEqual({});
  });

  it('defaults config to {} when raw.config is a primitive (string)', () => {
    const payload = {
      id: 'int-1',
      orgId: 'org-1',
      botToken: 'tok',
      config: 'bad',
    };
    const result = normalizeIntegration(payload, 'discord');
    expect(result?.config).toEqual({});
  });

  it('defaults config to {} when raw.config is an array', () => {
    const payload = {
      id: 'int-1',
      orgId: 'org-1',
      botToken: 'tok',
      config: ['a', 'b'],
    };
    const result = normalizeIntegration(payload, 'discord');
    expect(result?.config).toEqual({});
  });

  it('returns a valid Date when createdAt/updatedAt is an unparseable string', () => {
    const before = Date.now();
    const payload = {
      id: 'int-1',
      orgId: 'org-1',
      botToken: 'tok',
      createdAt: 'not-a-date',
      updatedAt: 'also-not-a-date',
    };
    const result = normalizeIntegration(payload, 'slack');
    const after = Date.now();

    expect(Number.isNaN(result?.createdAt.getTime())).toBe(false);
    expect(result?.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result?.createdAt.getTime()).toBeLessThanOrEqual(after);
    expect(Number.isNaN(result?.updatedAt.getTime())).toBe(false);
    expect(result?.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result?.updatedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('uses the platform argument passed in', () => {
    const payload = { id: 'int-1', orgId: 'org-1', botToken: 'tok' };
    const discord = normalizeIntegration(payload, 'discord');
    const slack = normalizeIntegration(payload, 'slack');
    const telegram = normalizeIntegration(payload, 'telegram');
    expect(discord?.platform).toBe('discord');
    expect(slack?.platform).toBe('slack');
    expect(telegram?.platform).toBe('telegram');
  });
});

describe('normalizeIntegrations', () => {
  it('returns empty array for non-array input', () => {
    expect(normalizeIntegrations(null, 'discord')).toEqual([]);
    expect(normalizeIntegrations({}, 'discord')).toEqual([]);
    expect(normalizeIntegrations('string', 'discord')).toEqual([]);
  });

  it('returns empty array for empty array input', () => {
    expect(normalizeIntegrations([], 'discord')).toEqual([]);
  });

  it('normalizes all valid entries', () => {
    const payload = [
      { id: 'int-1', orgId: 'org-1', botToken: 'tok-1', status: 'active' },
      { id: 'int-2', orgId: 'org-2', botToken: 'tok-2', status: 'paused' },
    ];

    const result = normalizeIntegrations(payload, 'slack');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('int-1');
    expect(result[1].id).toBe('int-2');
  });

  it('silently drops invalid entries', () => {
    const payload = [
      { id: 'int-1', orgId: 'org-1', botToken: 'tok-1' },
      null,
      {},
      { id: 'int-3', orgId: 'org-3', botToken: 'tok-3' },
    ];

    const result = normalizeIntegrations(payload, 'telegram');
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['int-1', 'int-3']);
  });

  it('passes the platform to each normalization', () => {
    const payload = [{ id: 'i', orgId: 'o', botToken: 't' }];
    const result = normalizeIntegrations(payload, 'discord');
    expect(result[0].platform).toBe('discord');
  });
});

import { describe, expect, it } from 'vitest';

import { normalizeIntegration, normalizeIntegrations } from './bot-normalize';

describe('normalizeIntegration', () => {
  it('returns null for null payload', () => {
    expect(normalizeIntegration(null, 'DISCORD')).toBeNull();
  });

  it('returns null for non-object payload', () => {
    expect(normalizeIntegration('string', 'DISCORD')).toBeNull();
    expect(normalizeIntegration(42, 'DISCORD')).toBeNull();
    expect(normalizeIntegration(undefined, 'DISCORD')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(normalizeIntegration({}, 'DISCORD')).toBeNull();
    expect(normalizeIntegration({ id: 'x' }, 'DISCORD')).toBeNull();
    expect(
      normalizeIntegration({ id: 'x', organizationId: 'o' }, 'DISCORD'),
    ).toBeNull();
  });

  it('normalizes a canonical API payload', () => {
    const payload = {
      id: 'int-1',
      organizationId: 'org-1',
      botToken: 'tok-abc',
      config: { allowedUserIds: ['u1'] },
      status: 'ACTIVE',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-06-01T00:00:00.000Z',
    };

    const result = normalizeIntegration(payload, 'DISCORD');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('int-1');
    expect(result!.orgId).toBe('org-1');
    expect(result!.botToken).toBe('tok-abc');
    expect(result!.platform).toBe('DISCORD');
    expect(result!.status).toBe('ACTIVE');
    expect(result!.config.allowedUserIds).toContain('u1');
  });

  it('rejects Mongo-era aliases', () => {
    const payload = {
      _id: 'mongo-id-123',
      organization: 'org-mongo-1',
      botToken: 'tok-mongo',
      config: {},
      status: 'ACTIVE',
    };

    expect(normalizeIntegration(payload, 'TELEGRAM')).toBeNull();
  });

  it('ignores an obsolete _id when the canonical fields are present', () => {
    const payload = {
      id: 'prisma-id',
      _id: 'mongo-id',
      organizationId: 'org-1',
      botToken: 'tok',
    };

    const result = normalizeIntegration(payload, 'SLACK');
    expect(result!.id).toBe('prisma-id');
  });

  it('defaults status to "ACTIVE" when absent', () => {
    const payload = {
      id: 'int-1',
      organizationId: 'org-1',
      botToken: 'tok',
    };

    const result = normalizeIntegration(payload, 'SLACK');
    expect(result!.status).toBe('ACTIVE');
  });

  it('falls back to ACTIVE for a status outside the Prisma enum', () => {
    // IntegrationStatus is Prisma-backed, so SCREAMING_SNAKE is the only wire
    // format. Legacy lowercase is unknown input, not a second spelling.
    for (const status of ['active', 'PENDING', '', 42, null]) {
      const result = normalizeIntegration(
        { botToken: 'tok', id: 'int-1', organizationId: 'org-1', status },
        'SLACK',
      );
      expect(result!.status).toBe('ACTIVE');
    }
  });

  it('preserves every valid Prisma status label', () => {
    for (const status of ['ACTIVE', 'PAUSED', 'ERROR']) {
      const result = normalizeIntegration(
        { botToken: 'tok', id: 'int-1', organizationId: 'org-1', status },
        'SLACK',
      );
      expect(result!.status).toBe(status);
    }
  });

  it('defaults createdAt/updatedAt to now when absent', () => {
    const before = Date.now();
    const payload = {
      id: 'int-1',
      organizationId: 'org-1',
      botToken: 'tok',
    };
    const result = normalizeIntegration(payload, 'DISCORD');
    const after = Date.now();

    expect(result!.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result!.createdAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('defaults config to empty object when absent', () => {
    const payload = {
      id: 'int-1',
      organizationId: 'org-1',
      botToken: 'tok',
    };
    const result = normalizeIntegration(payload, 'TELEGRAM');
    expect(result!.config).toEqual({});
  });

  it('uses the platform argument passed in', () => {
    const payload = {
      id: 'int-1',
      organizationId: 'org-1',
      botToken: 'tok',
    };
    const discord = normalizeIntegration(payload, 'DISCORD');
    const slack = normalizeIntegration(payload, 'SLACK');
    const telegram = normalizeIntegration(payload, 'TELEGRAM');
    expect(discord!.platform).toBe('DISCORD');
    expect(slack!.platform).toBe('SLACK');
    expect(telegram!.platform).toBe('TELEGRAM');
  });
});

describe('normalizeIntegrations', () => {
  it('returns empty array for non-array input', () => {
    expect(normalizeIntegrations(null, 'DISCORD')).toEqual([]);
    expect(normalizeIntegrations({}, 'DISCORD')).toEqual([]);
    expect(normalizeIntegrations('string', 'DISCORD')).toEqual([]);
  });

  it('returns empty array for empty array input', () => {
    expect(normalizeIntegrations([], 'DISCORD')).toEqual([]);
  });

  it('normalizes all valid entries', () => {
    const payload = [
      {
        id: 'int-1',
        organizationId: 'org-1',
        botToken: 'tok-1',
        status: 'ACTIVE',
      },
      {
        id: 'int-2',
        organizationId: 'org-2',
        botToken: 'tok-2',
        status: 'PAUSED',
      },
    ];

    const result = normalizeIntegrations(payload, 'SLACK');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('int-1');
    expect(result[1].id).toBe('int-2');
  });

  it('silently drops invalid entries', () => {
    const payload = [
      { id: 'int-1', organizationId: 'org-1', botToken: 'tok-1' },
      null,
      {},
      { id: 'int-3', organizationId: 'org-3', botToken: 'tok-3' },
    ];

    const result = normalizeIntegrations(payload, 'TELEGRAM');
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['int-1', 'int-3']);
  });

  it('passes the platform to each normalization', () => {
    const payload = [{ id: 'i', organizationId: 'o', botToken: 't' }];
    const result = normalizeIntegrations(payload, 'DISCORD');
    expect(result[0].platform).toBe('DISCORD');
  });
});

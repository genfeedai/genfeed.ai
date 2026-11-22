import {
  CONTENT_KEY_DEDUPE_WINDOW_MS,
  PostGroupIdempotencyService,
} from '@api/collections/post-groups/services/post-group-idempotency.service';
import type { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { ReleaseStatus } from '@genfeedai/contracts';
import { CONTENT_RELEASE_IDEMPOTENCY_PREFIX } from '@genfeedai/contracts/constants/release-idempotency.constant';
import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';

const CONTENT_KEY = `${CONTENT_RELEASE_IDEMPOTENCY_PREFIX}abc`;

describe('PostGroupIdempotencyService', () => {
  /** In-memory stand-in for the unique index [organizationId, idempotencyKey]. */
  let groups: Map<string, IReleaseGroup>;
  /** Keys held by soft-deleted groups: they block the index but are not found. */
  let deletedKeys: Set<string>;
  let nextId: number;
  let service: PostGroupIdempotencyService;

  const create = async (key: string | undefined): Promise<IReleaseGroup> => {
    if (key && (groups.has(key) || deletedKeys.has(key))) {
      throw Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
    }
    const group = {
      createdAt: new Date().toISOString(),
      id: `group-${nextId++}`,
      status: ReleaseStatus.SCHEDULED,
    } as IReleaseGroup;
    if (key) {
      groups.set(key, group);
    }
    return group;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T10:00:00.000Z'));
    groups = new Map();
    deletedKeys = new Set();
    nextId = 1;
    const persistence = {
      // Deleted groups still hold their unique-index entry, so they count.
      countByIdempotencyKeyPrefix: async (_org: string, prefix: string) =>
        [...groups.keys(), ...deletedKeys].filter((key) =>
          key.startsWith(prefix),
        ).length,
      findByIdempotencyKey: async (_org: string, key: string) =>
        groups.get(key),
    } as unknown as PostGroupPersistenceService;
    service = new PostGroupIdempotencyService(persistence);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const MINUTE = 60 * 1000;

  it('replays a live group for a content-derived key', async () => {
    const first = await service.run('org-1', CONTENT_KEY, create);
    const second = await service.run('org-1', CONTENT_KEY, create);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.group.id).toBe(first.group.id);
  });

  it('creates a live release after the earlier one for the content key was cancelled', async () => {
    const first = await service.run('org-1', CONTENT_KEY, create);
    first.group.status = ReleaseStatus.CANCELLED;

    const second = await service.run('org-1', CONTENT_KEY, create);
    const retried = await service.run('org-1', CONTENT_KEY, create);

    expect(second.replayed).toBe(false);
    expect(second.group.id).not.toBe(first.group.id);
    expect(second.group.status).toBe(ReleaseStatus.SCHEDULED);
    expect(groups.get(`${CONTENT_KEY}:1`)?.id).toBe(second.group.id);
    expect(retried.group.id).toBe(second.group.id);
  });

  it('moves past a soft-deleted holder of a content-derived key', async () => {
    deletedKeys.add(CONTENT_KEY);

    const result = await service.run('org-1', CONTENT_KEY, create);

    expect(result.replayed).toBe(false);
    expect(groups.get(`${CONTENT_KEY}:1`)?.id).toBe(result.group.id);
  });

  it('creates past any number of soft-deleted holders of a content-derived key', async () => {
    deletedKeys.add(CONTENT_KEY);
    for (let generation = 1; generation < 40; generation++) {
      deletedKeys.add(`${CONTENT_KEY}:${generation}`);
    }

    const result = await service.run('org-1', CONTENT_KEY, create);
    const retried = await service.run('org-1', CONTENT_KEY, create);

    expect(result.replayed).toBe(false);
    expect(groups.get(`${CONTENT_KEY}:40`)?.id).toBe(result.group.id);
    expect(retried.replayed).toBe(true);
    expect(retried.group.id).toBe(result.group.id);
  });

  it('keeps replaying a cancelled group for a caller-chosen key', async () => {
    const first = await service.run('org-1', 'caller-key', create);
    first.group.status = ReleaseStatus.CANCELLED;

    const second = await service.run('org-1', 'caller-key', create);

    expect(second.replayed).toBe(true);
    expect(second.group.id).toBe(first.group.id);
  });

  it('returns the winner when a concurrent create takes the key', async () => {
    const winner = {
      id: 'winner',
      status: ReleaseStatus.DRAFT,
    } as IReleaseGroup;
    const racing = async (key: string | undefined) => {
      groups.set(key as string, winner);
      throw Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
    };

    const result = await service.run('org-1', 'caller-key', racing);

    expect(result).toEqual({ group: winner, replayed: true });
  });

  it('rethrows errors that are not unique violations', async () => {
    await expect(
      service.run('org-1', 'caller-key', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('creates without a key when none is given', async () => {
    const result = await service.run('org-1', undefined, create);

    expect(result.replayed).toBe(false);
    expect(result.group.id).toBe('group-1');
  });

  it('replays identical content one minute later', async () => {
    const first = await service.run('org-1', CONTENT_KEY, create);
    vi.advanceTimersByTime(MINUTE);

    const second = await service.run('org-1', CONTENT_KEY, create);

    expect(second.replayed).toBe(true);
    expect(second.group.id).toBe(first.group.id);
  });

  it('creates a new live group for identical content 11 minutes later', async () => {
    const first = await service.run('org-1', CONTENT_KEY, create);
    vi.advanceTimersByTime(11 * MINUTE);

    const second = await service.run('org-1', CONTENT_KEY, create);

    expect(CONTENT_KEY_DEDUPE_WINDOW_MS).toBe(10 * MINUTE);
    expect(second.replayed).toBe(false);
    expect(second.group.id).not.toBe(first.group.id);
    expect(second.group.status).toBe(ReleaseStatus.SCHEDULED);
  });

  it('replays the latest group, not the first, for a call inside the second window', async () => {
    await service.run('org-1', CONTENT_KEY, create);
    vi.advanceTimersByTime(11 * MINUTE);
    const second = await service.run('org-1', CONTENT_KEY, create);
    vi.advanceTimersByTime(MINUTE);

    const third = await service.run('org-1', CONTENT_KEY, create);

    expect(third.replayed).toBe(true);
    expect(third.group.id).toBe(second.group.id);
    expect(groups.size).toBe(2);
  });

  it('creates exactly one group for two concurrent identical calls', async () => {
    const results = await Promise.all([
      service.run('org-1', CONTENT_KEY, create),
      service.run('org-1', CONTENT_KEY, create),
    ]);

    expect(groups.size).toBe(1);
    expect(results[0].group.id).toBe(results[1].group.id);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
  });

  it('creates exactly one new group for concurrent retries after an old one', async () => {
    await service.run('org-1', CONTENT_KEY, create);
    vi.advanceTimersByTime(11 * MINUTE);

    const results = await Promise.all([
      service.run('org-1', CONTENT_KEY, create),
      service.run('org-1', CONTENT_KEY, create),
    ]);

    expect(groups.size).toBe(2);
    expect(results[0].group.id).toBe(results[1].group.id);
  });

  it('accepts 30 spaced-out identical repeats', async () => {
    const ids = new Set<string>();
    for (let day = 0; day < 30; day++) {
      const result = await service.run('org-1', CONTENT_KEY, create);
      expect(result.replayed).toBe(false);
      ids.add(result.group.id);
      vi.advanceTimersByTime(24 * 60 * MINUTE);
    }

    expect(ids.size).toBe(30);
  });
});

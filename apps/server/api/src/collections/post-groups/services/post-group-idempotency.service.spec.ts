import { PostGroupIdempotencyService } from '@api/collections/post-groups/services/post-group-idempotency.service';
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
      id: `group-${nextId++}`,
      status: ReleaseStatus.SCHEDULED,
    } as IReleaseGroup;
    if (key) {
      groups.set(key, group);
    }
    return group;
  };

  beforeEach(() => {
    groups = new Map();
    deletedKeys = new Set();
    nextId = 1;
    const persistence = {
      findByIdempotencyKey: async (_org: string, key: string) =>
        groups.get(key),
    } as unknown as PostGroupPersistenceService;
    service = new PostGroupIdempotencyService(persistence);
  });

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
});

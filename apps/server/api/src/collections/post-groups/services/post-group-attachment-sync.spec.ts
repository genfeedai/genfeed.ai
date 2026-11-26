import type {
  SchedulerPostGroup,
  SchedulerPostTarget,
  SchedulerTx,
} from '@api/collections/post-groups/services/post-group.types';
import { planAttachmentPosts } from '@api/collections/post-groups/services/post-group-attachment-posts.util';
import { syncReleaseAttachmentPosts } from '@api/collections/post-groups/services/post-group-attachment-sync';
import {
  CredentialPlatform,
  PostVisibility,
  ReleaseAttachmentKind,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';

type Row = Record<string, unknown>;

/**
 * An in-memory `post` table that understands only the filters the sync uses.
 * An unknown filter throws, so a query that grows a new condition cannot pass
 * here by being ignored.
 */
function createPostTable(initial: Row[] = []) {
  const rows: Row[] = [...initial];
  let nextId = 1;

  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, condition]) => {
      if (key === 'OR') {
        return (condition as Row[]).some((branch) => matches(row, branch));
      }
      if (key === 'label' || key === 'targetExecutionState' || key === 'id') {
        const value = row[key] as string | null;
        const filter = condition as
          | {
              endsWith?: string;
              in?: string[];
            }
          | string;
        if (typeof filter === 'string') {
          return value === filter;
        }
        if (filter.endsWith !== undefined) {
          return typeof value === 'string' && value.endsWith(filter.endsWith);
        }
        if (filter.in !== undefined) {
          return filter.in.includes(value as string);
        }
      }
      if (['isDeleted', 'organizationId', 'parentId'].includes(key)) {
        return row[key] === condition;
      }
      throw new Error(`post table: unsupported filter ${key}`);
    });

  const post = {
    create: async ({ data }: { data: Row }) => {
      const row = {
        createdAt: new Date(2026, 0, 1, 0, 0, nextId),
        id: `child-${nextId}`,
        isDeleted: false,
        ...data,
      };
      nextId += 1;
      rows.push(row);
      return row;
    },
    findMany: async ({ where }: { where: Row }) =>
      rows
        .filter((row) => matches(row, where))
        .sort((a, b) => (a.order as number) - (b.order as number)),
    updateMany: async ({ data, where }: { data: Row; where: Row }) => {
      const hit = rows.filter((row) => matches(row, where));
      for (const row of hit) {
        Object.assign(row, data);
      }
      return { count: hit.length };
    },
  };

  return { post: post as unknown as SchedulerTx['post'], rows };
}

const EDITABLE_STATES = new Set<string>([
  TargetExecutionState.DRAFT,
  TargetExecutionState.SCHEDULED,
  TargetExecutionState.PAUSED,
  TargetExecutionState.FAILED,
]);
const SCHEDULED_AT = new Date('2026-11-27T15:00:00.000Z');

function makeGroup(
  overrides: Partial<SchedulerPostGroup> = {},
): SchedulerPostGroup {
  return {
    attachments: [],
    id: 'group-1',
    organizationId: 'org-1',
    title: 'Golden hour',
    ...overrides,
  } as SchedulerPostGroup;
}

function makeTarget(
  overrides: Partial<SchedulerPostTarget> = {},
): SchedulerPostTarget {
  return {
    brandId: 'brand-1',
    credentialId: 'credential-1',
    id: 'target-1',
    platform: CredentialPlatform.INSTAGRAM,
    scheduledDate: SCHEDULED_AT,
    targetAttachments: [],
    targetExecutionState: TargetExecutionState.SCHEDULED,
    timezone: 'Europe/Malta',
    visibility: PostVisibility.PUBLIC,
    ...overrides,
  } as SchedulerPostTarget;
}

function childrenOf(table: ReturnType<typeof createPostTable>): Row[] {
  return table.rows.filter((row) => row.isDeleted === false);
}

const FIRST_COMMENT = {
  body: '#goldenhour #koro',
  kind: ReleaseAttachmentKind.COMMENT,
};

describe('syncReleaseAttachmentPosts', () => {
  it('queues a first comment added to a release that was created without one', async () => {
    const table = createPostTable();
    const tx = table as unknown as SchedulerTx;

    await syncReleaseAttachmentPosts(tx, {
      editableStates: EDITABLE_STATES,
      group: makeGroup({ attachments: [FIRST_COMMENT] }),
      organizationId: 'org-1',
      targets: [makeTarget()],
      userId: 'user-1',
    });

    expect(childrenOf(table)).toEqual([
      expect.objectContaining({
        description: '#goldenhour #koro',
        groupId: 'group-1',
        label: 'Golden hour comment',
        parentId: 'target-1',
        platform: CredentialPlatform.INSTAGRAM,
        scheduledDate: SCHEDULED_AT,
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ]);
  });

  it('rewrites the comment text and removes a comment that was dropped', async () => {
    const table = createPostTable();
    const tx = table as unknown as SchedulerTx;
    const targets = [makeTarget()];

    await syncReleaseAttachmentPosts(tx, {
      editableStates: EDITABLE_STATES,
      group: makeGroup({
        attachments: [
          FIRST_COMMENT,
          { body: 'second', kind: ReleaseAttachmentKind.COMMENT },
        ],
      }),
      organizationId: 'org-1',
      targets,
      userId: 'user-1',
    });
    await syncReleaseAttachmentPosts(tx, {
      editableStates: EDITABLE_STATES,
      group: makeGroup({
        attachments: [{ body: '#edited', kind: ReleaseAttachmentKind.COMMENT }],
      }),
      organizationId: 'org-1',
      targets,
      userId: 'user-1',
    });

    expect(childrenOf(table).map((row) => row.description)).toEqual([
      '#edited',
    ]);
  });

  it('removes the comment when the release no longer has one', async () => {
    const table = createPostTable();
    const tx = table as unknown as SchedulerTx;
    const targets = [makeTarget()];

    await syncReleaseAttachmentPosts(tx, {
      editableStates: EDITABLE_STATES,
      group: makeGroup({ attachments: [FIRST_COMMENT] }),
      organizationId: 'org-1',
      targets,
      userId: 'user-1',
    });
    await syncReleaseAttachmentPosts(tx, {
      editableStates: EDITABLE_STATES,
      group: makeGroup({ attachments: [] }),
      organizationId: 'org-1',
      targets,
      userId: 'user-1',
    });

    expect(childrenOf(table)).toEqual([]);
  });

  it('is idempotent: syncing the same attachments twice keeps one comment', async () => {
    const table = createPostTable();
    const tx = table as unknown as SchedulerTx;
    const params = {
      editableStates: EDITABLE_STATES,
      group: makeGroup({ attachments: [FIRST_COMMENT] }),
      organizationId: 'org-1',
      targets: [makeTarget()],
      userId: 'user-1',
    };

    await syncReleaseAttachmentPosts(tx, params);
    await syncReleaseAttachmentPosts(tx, params);

    expect(childrenOf(table)).toHaveLength(1);
  });

  it('moves the comment to SCHEDULED with its parent, so the worker loads it', async () => {
    const table = createPostTable();
    const tx = table as unknown as SchedulerTx;
    const group = makeGroup({ attachments: [FIRST_COMMENT] });

    await syncReleaseAttachmentPosts(tx, {
      editableStates: EDITABLE_STATES,
      group,
      organizationId: 'org-1',
      targets: [
        makeTarget({ targetExecutionState: TargetExecutionState.DRAFT }),
      ],
      userId: 'user-1',
    });
    await syncReleaseAttachmentPosts(tx, {
      editableStates: EDITABLE_STATES,
      group,
      organizationId: 'org-1',
      targets: [makeTarget()],
      userId: 'user-1',
    });

    expect(childrenOf(table)).toEqual([
      expect.objectContaining({
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    ]);
  });

  it('follows a rescheduled parent', async () => {
    const table = createPostTable();
    const tx = table as unknown as SchedulerTx;
    const group = makeGroup({ attachments: [FIRST_COMMENT] });
    const moved = new Date('2026-11-28T09:00:00.000Z');

    await syncReleaseAttachmentPosts(tx, {
      editableStates: EDITABLE_STATES,
      group,
      organizationId: 'org-1',
      targets: [makeTarget()],
      userId: 'user-1',
    });
    await syncReleaseAttachmentPosts(tx, {
      editableStates: EDITABLE_STATES,
      group,
      organizationId: 'org-1',
      targets: [makeTarget({ scheduledDate: moved })],
      userId: 'user-1',
    });

    expect(childrenOf(table)).toEqual([
      expect.objectContaining({ scheduledDate: moved }),
    ]);
  });

  it('leaves a target that already published, and thread children it did not write', async () => {
    const agentThreadChild = {
      description: 'agent reply',
      id: 'agent-child',
      isDeleted: false,
      label: 'Reply 2',
      order: 0,
      organizationId: 'org-1',
      parentId: 'target-1',
      targetExecutionState: TargetExecutionState.SCHEDULED,
    };
    const table = createPostTable([agentThreadChild]);
    const tx = table as unknown as SchedulerTx;

    await syncReleaseAttachmentPosts(tx, {
      editableStates: EDITABLE_STATES,
      group: makeGroup({ attachments: [] }),
      organizationId: 'org-1',
      targets: [makeTarget()],
      userId: 'user-1',
    });
    await syncReleaseAttachmentPosts(tx, {
      editableStates: EDITABLE_STATES,
      group: makeGroup({ attachments: [FIRST_COMMENT] }),
      organizationId: 'org-1',
      targets: [
        makeTarget({ targetExecutionState: TargetExecutionState.PUBLISHED }),
      ],
      userId: 'user-1',
    });

    expect(childrenOf(table)).toEqual([agentThreadChild]);
  });

  it('skips a channel with no comment surface when the comment was meant for every channel', async () => {
    const table = createPostTable();
    const tx = table as unknown as SchedulerTx;

    await syncReleaseAttachmentPosts(tx, {
      editableStates: EDITABLE_STATES,
      group: makeGroup({ attachments: [FIRST_COMMENT] }),
      organizationId: 'org-1',
      targets: [
        makeTarget({ id: 'tiktok', platform: CredentialPlatform.TIKTOK }),
        makeTarget({ id: 'instagram' }),
      ],
      userId: 'user-1',
    });

    expect(childrenOf(table).map((row) => row.parentId)).toEqual(['instagram']);
  });
});

describe('planAttachmentPosts', () => {
  it.each([
    {
      expected: [{ body: 'a', kind: 'comment', order: 0 }],
      name: 'a release comment for every channel',
      platform: CredentialPlatform.INSTAGRAM,
      release: [{ body: 'a', kind: ReleaseAttachmentKind.COMMENT }],
      target: [],
    },
    {
      expected: [],
      name: 'a comment aimed at another channel',
      platform: CredentialPlatform.INSTAGRAM,
      release: [
        {
          body: 'a',
          kind: ReleaseAttachmentKind.COMMENT,
          platform: CredentialPlatform.LINKEDIN,
        },
      ],
      target: [],
    },
    {
      expected: [{ body: 'sig', kind: 'comment', order: 0 }],
      name: 'only comments and threads, never a signature',
      platform: CredentialPlatform.INSTAGRAM,
      release: [
        { body: 'sig', kind: ReleaseAttachmentKind.COMMENT },
        { body: 'ignored', kind: ReleaseAttachmentKind.SIGNATURE },
      ],
      target: [],
    },
    {
      expected: [
        { body: 'release', kind: 'comment', order: 0 },
        { body: 'target', kind: 'comment', order: 1 },
      ],
      name: 'release attachments before target ones',
      platform: CredentialPlatform.INSTAGRAM,
      release: [{ body: 'release', kind: ReleaseAttachmentKind.COMMENT }],
      target: [{ body: 'target', kind: ReleaseAttachmentKind.COMMENT }],
    },
  ])('plans $name', ({ expected, platform, release, target }) => {
    expect(
      planAttachmentPosts({
        platform,
        releaseAttachments: release,
        targetAttachments: target,
      }),
    ).toEqual(expected);
  });

  it('refuses a comment aimed at a channel that cannot publish one', () => {
    expect(() =>
      planAttachmentPosts({
        platform: CredentialPlatform.TIKTOK,
        releaseAttachments: [],
        targetAttachments: [{ body: 'a', kind: ReleaseAttachmentKind.COMMENT }],
      }),
    ).toThrow(BadRequestException);
  });
});

import { syncReleaseTitleWithTargetLabel } from '@api/collections/posts/services/post-patch-write.util';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it } from 'vitest';

type Row = { groupId: string; id: string; parentId: string | null };

/** An in-memory store that answers the two queries the sync makes. */
function buildStore(rows: Row[], groupTitles: Record<string, string>) {
  const tx = {
    post: {
      count: async ({ where }: { where: { groupId: string } }) =>
        rows.filter(
          (row) => row.groupId === where.groupId && row.parentId === null,
        ).length,
    },
    postGroup: {
      updateMany: async ({
        data,
        where,
      }: {
        data: { title: string };
        where: { id: string };
      }) => {
        groupTitles[where.id] = data.title;
        return { count: 1 };
      },
    },
  } as unknown as Prisma.TransactionClient;
  return tx;
}

describe('syncReleaseTitleWithTargetLabel', () => {
  it('renames a single-target release to the new label', async () => {
    const titles = { 'group-1': 'Koro golden hour carousel' };
    const tx = buildStore(
      [{ groupId: 'group-1', id: 'post-1', parentId: null }],
      titles,
    );

    await syncReleaseTitleWithTargetLabel(tx, {
      groupId: 'group-1',
      label: '  Golden hour  ',
      organizationId: 'org-1',
      parentId: null,
    });

    expect(titles['group-1']).toBe('Golden hour');
  });

  it('keeps the title of a release with several targets', async () => {
    const titles = { 'group-1': 'Koro golden hour carousel' };
    const tx = buildStore(
      [
        { groupId: 'group-1', id: 'post-1', parentId: null },
        { groupId: 'group-1', id: 'post-2', parentId: null },
      ],
      titles,
    );

    await syncReleaseTitleWithTargetLabel(tx, {
      groupId: 'group-1',
      label: 'Golden hour',
      organizationId: 'org-1',
      parentId: null,
    });

    expect(titles['group-1']).toBe('Koro golden hour carousel');
  });

  it.each([
    ['a comment post', { groupId: 'group-1', label: 'x', parentId: 'post-1' }],
    ['a post with no release', { groupId: null, label: 'x', parentId: null }],
    ['an empty label', { groupId: 'group-1', label: '   ', parentId: null }],
  ])('leaves the title alone for %s', async (_name, params) => {
    const titles = { 'group-1': 'Koro golden hour carousel' };
    const tx = buildStore(
      [{ groupId: 'group-1', id: 'post-1', parentId: null }],
      titles,
    );

    await syncReleaseTitleWithTargetLabel(tx, {
      ...params,
      organizationId: 'org-1',
    });

    expect(titles['group-1']).toBe('Koro golden hour carousel');
  });
});

/**
 * Serves the release list's Prisma reads from fixtures. Rows come back whole
 * (a superset of every `select`), narrowed only by the id/group predicates the
 * service sends, so a spec exercises the service's own filtering and paging.
 */
type FindManyMock = {
  mockImplementation: (implementation: (args: never) => unknown) => unknown;
};

type ListGroup = { id: string };
type ListTarget = { groupId: string | null; id: string };

type GroupFindManyArgs = {
  select: Record<string, unknown>;
  where: { id?: { in: string[] } };
};

type TargetFindManyArgs = {
  select: Record<string, unknown>;
  where: {
    groupId?: null | { in?: string[]; not?: null };
    id?: { in: string[] };
  };
};

export function seedReleaseListReads<
  TGroup extends ListGroup,
  TTarget extends ListTarget,
>(
  prisma: {
    post: { findMany: FindManyMock };
    postGroup: { findMany: FindManyMock };
  },
  groups: TGroup[],
  targets: TTarget[],
): void {
  prisma.postGroup.findMany.mockImplementation(
    async ({ select, where }: GroupFindManyArgs) => {
      const rows = groups.filter(
        (group) => !where.id?.in || where.id.in.includes(group.id),
      );
      return Object.keys(select).join() === 'id'
        ? rows.map((group) => ({ id: group.id }))
        : rows;
    },
  );
  prisma.post.findMany.mockImplementation(
    async ({ select, where }: TargetFindManyArgs) => {
      const rows = targets.filter((target) => {
        if (where.id?.in && !where.id.in.includes(target.id)) {
          return false;
        }
        if (where.groupId === null) {
          return target.groupId === null;
        }
        if (where.groupId?.in) {
          return (
            target.groupId !== null && where.groupId.in.includes(target.groupId)
          );
        }
        return where.groupId?.not === null ? target.groupId !== null : true;
      });
      return Object.keys(select).join() === 'groupId'
        ? rows.map((target) => ({ groupId: target.groupId }))
        : rows;
    },
  );
}

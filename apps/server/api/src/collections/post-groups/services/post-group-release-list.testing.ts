/**
 * Serves the release list for a spec: `$queryRaw` answers the page statement
 * with the ordered ids the SQL would return (the SQL itself runs in the
 * Postgres spec), and the Prisma reads that hydrate the page return fixture
 * rows narrowed only by the id/group predicates the service sends.
 */
type MockFn = {
  mockImplementation: (
    implementation: (...args: never[]) => unknown,
  ) => unknown;
};

type ListGroup = { id: string };
type ListTarget = { groupId: string | null; id: string };

type GroupFindManyArgs = { where: { id?: { in: string[] } } };

type TargetFindManyArgs = {
  where: {
    groupId?: null | { in?: string[] };
    id?: { in: string[] };
  };
};

type RawSqlArg = { sql?: string; text?: string };

export type SeededReleasePageRow = {
  id: string;
  isSynthetic?: boolean;
};

/** Marks the release-list statement among the other raw reads the service makes. */
const RELEASE_LIST_STATEMENT = 'release_rows';

export function seedReleaseListPage<
  TGroup extends ListGroup,
  TTarget extends ListTarget,
>(
  prisma: {
    $queryRaw: MockFn;
    post: { findMany: MockFn };
    postGroup: { findMany: MockFn };
  },
  groups: TGroup[],
  targets: TTarget[],
  pageRows: SeededReleasePageRow[],
  totalDocs: number = pageRows.length,
): void {
  prisma.$queryRaw.mockImplementation(async (statement: RawSqlArg) =>
    (statement.sql ?? statement.text ?? '').includes(RELEASE_LIST_STATEMENT)
      ? pageRows.map((row) => ({
          id: row.id,
          isSynthetic: row.isSynthetic ?? false,
          totalDocs: BigInt(totalDocs),
        }))
      : [],
  );
  prisma.postGroup.findMany.mockImplementation(
    async ({ where }: GroupFindManyArgs) =>
      groups.filter((group) => !where.id?.in || where.id.in.includes(group.id)),
  );
  prisma.post.findMany.mockImplementation(
    async ({ where }: TargetFindManyArgs) =>
      targets.filter((target) => {
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
        return true;
      }),
  );
}

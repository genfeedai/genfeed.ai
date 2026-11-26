import type { SchedulerTx } from '@api/collections/post-groups/services/post-group.types';

export type PostTableRow = Record<string, unknown>;
type Row = PostTableRow;

/**
 * An in-memory `post` table that understands only the filters the sync uses.
 * An unknown filter throws, so a query that grows a new condition cannot pass
 * here by being ignored.
 */
export function createPostTable(initial: Row[] = []) {
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

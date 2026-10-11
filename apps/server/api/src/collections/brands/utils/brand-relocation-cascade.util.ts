import {
  AUDITOR_IGNORED_TABLES,
  FIRST_ORDER_TARGETS,
  SECOND_ORDER_TARGETS,
  type SecondOrderCascadeTarget,
} from '@api/collections/brands/constants/brand-org-cascade.constants';
import { Prisma } from '@genfeedai/prisma';
import { InternalServerErrorException } from '@nestjs/common';

/**
 * Minimal structural view of a Prisma model delegate, used to drive the brand→org
 * relocation cascade generically over the config in `brand-org-cascade.constants`.
 * The concrete `Prisma.TransactionClient` delegates satisfy this shape.
 */
export interface CascadeDelegate {
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  findMany(args: {
    where: Record<string, unknown>;
    select: Record<string, boolean>;
  }): Promise<{ id: string }[]>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
}

/** Parent ids already read for one cascade pass, shared by every child of that parent. */
export type SecondOrderParentIds = Map<string, Promise<string[]>>;

// Keep each `IN (...)` list far below the bind-parameter ceiling for brands with
// many parent rows.
const SECOND_ORDER_ID_CHUNK_SIZE = 5_000;

/**
 * The `IN (...)` filters that select a second-order child's rows: one group per
 * parent, each split into chunks so a brand with many parent rows never exceeds
 * the bind-parameter limit. Parent ids are read once per parent query and shared
 * by every child of that parent.
 */
export async function resolveSecondOrderFilters(
  client: Record<string, CascadeDelegate>,
  child: SecondOrderCascadeTarget,
  brandId: string,
  parentIds: SecondOrderParentIds,
): Promise<Record<string, unknown>[][]> {
  const groups: Record<string, unknown>[][] = [];
  for (const parent of child.parents) {
    const key = `${parent.parentDelegate}:${parent.parentRelation ?? ''}:${parent.parentBrandField}`;
    let pending = parentIds.get(key);
    if (!pending) {
      pending = client[parent.parentDelegate]
        .findMany({
          select: { id: true },
          where: parent.parentRelation
            ? {
                [parent.parentRelation]: {
                  [parent.parentBrandField]: brandId,
                },
              }
            : { [parent.parentBrandField]: brandId },
        })
        .then((rows) => rows.map((row) => row.id));
      parentIds.set(key, pending);
    }
    const ids = await pending;
    const filters: Record<string, unknown>[] = [];
    for (
      let start = 0;
      start < ids.length;
      start += SECOND_ORDER_ID_CHUNK_SIZE
    ) {
      filters.push({
        [parent.fkField]: {
          in: ids.slice(start, start + SECOND_ORDER_ID_CHUNK_SIZE),
        },
      });
    }
    if (filters.length > 0) {
      groups.push(filters);
    }
  }
  return groups;
}

/** Second-order children that still carry the old organization after the cascade. */
export async function findStaleSecondOrderChildren(
  client: Record<string, CascadeDelegate>,
  brandId: string,
  destOrgId: string,
): Promise<string[]> {
  const parentIds: SecondOrderParentIds = new Map();
  const stale: string[] = [];
  for (const child of SECOND_ORDER_TARGETS) {
    const groups = await resolveSecondOrderFilters(
      client,
      child,
      brandId,
      parentIds,
    );
    let remaining = 0;
    for (const filter of groups.flat()) {
      remaining += await client[child.delegate].count({
        where: { ...filter, [child.orgField]: { not: destOrgId } },
      });
    }
    if (remaining > 0) {
      stale.push(`${child.delegate} (${remaining})`);
    }
  }
  return stale;
}

/**
 * Tables with an organization column and a single-column foreign key to a
 * first-order table that nothing handles: neither a first-order or second-order
 * target, nor a table the cascade deliberately leaves alone. A child like this
 * keeps the old organization when its parent moves.
 */
interface OrgOnlyChildCandidate {
  child_table: string;
  fk_column: string;
  org_column: string;
  parent_table: string;
}

const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function findUnhandledOrgOnlyChildren(
  tx: Prisma.TransactionClient,
  brandId: string,
  destOrgId: string,
): Promise<string[]> {
  const knownTables = new Set<string>([
    ...FIRST_ORDER_TARGETS.map((target) => target.table),
    ...SECOND_ORDER_TARGETS.map((target) => target.table),
    ...AUDITOR_IGNORED_TABLES,
  ]);
  const parentBrandColumns = new Map(
    FIRST_ORDER_TARGETS.map((target) => [target.table, target.brandField]),
  );

  // sql-risk-audit: ignore raw-sql-review -- static catalog introspection, no caller input interpolated.
  const candidates = await tx.$queryRaw<OrgOnlyChildCandidate[]>`
    SELECT child.relname AS child_table,
           child_att.attname AS fk_column,
           org_att.attname AS org_column,
           parent.relname AS parent_table
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace ns ON ns.oid = child.relnamespace AND ns.nspname = 'public'
    JOIN pg_attribute child_att
      ON child_att.attrelid = con.conrelid AND child_att.attnum = con.conkey[1]
    JOIN pg_attribute parent_att
      ON parent_att.attrelid = con.confrelid
      AND parent_att.attnum = con.confkey[1]
      AND parent_att.attname = 'id'
    JOIN pg_attribute org_att
      ON org_att.attrelid = con.conrelid
      AND org_att.attname = 'organizationId'
      AND NOT org_att.attisdropped
    WHERE con.contype = 'f'
      AND array_length(con.conkey, 1) = 1
      AND child_att.attname <> 'organizationId'`;

  const unhandled: string[] = [];
  for (const candidate of candidates) {
    const parentBrandField = parentBrandColumns.get(candidate.parent_table);
    if (
      !parentBrandField ||
      knownTables.has(candidate.child_table) ||
      ![
        candidate.child_table,
        candidate.fk_column,
        candidate.org_column,
        candidate.parent_table,
        parentBrandField,
      ].every((identifier) => SQL_IDENTIFIER.test(identifier))
    ) {
      continue;
    }
    // sql-risk-audit: ignore raw-sql-review -- identifiers come from the catalog and are validated to /^[A-Za-z_][A-Za-z0-9_]*$/ above; brandId/destOrgId are bound as parameters.
    const rows = await tx.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
      FROM ${Prisma.raw(`"${candidate.child_table}"`)} c
      JOIN ${Prisma.raw(`"${candidate.parent_table}"`)} p
        ON p."id" = c.${Prisma.raw(`"${candidate.fk_column}"`)}
      WHERE p.${Prisma.raw(`"${parentBrandField}"`)} = ${brandId}
        AND c.${Prisma.raw(`"${candidate.org_column}"`)} IS DISTINCT FROM ${destOrgId}`;
    const count = rows[0]?.n ?? 0;
    if (count > 0) {
      unhandled.push(
        `${candidate.child_table}.${candidate.fk_column} -> ${candidate.parent_table} (${count})`,
      );
    }
  }
  return unhandled;
}

/**
 * After the cascade, assert no org-only child of a moved parent still carries
 * the old organization: neither one the cascade is configured to move nor one
 * nobody configured. Rolls the whole relocation back (and surfaces which table
 * to add to `SECOND_ORDER_TARGETS`) instead of splitting tenancy.
 */
export async function assertNoOrgOnlyChildOrphans(
  tx: Prisma.TransactionClient,
  brandId: string,
  destOrgId: string,
): Promise<void> {
  const client = tx as unknown as Record<string, CascadeDelegate>;
  const stale = await findStaleSecondOrderChildren(client, brandId, destOrgId);
  if (stale.length > 0) {
    throw new InternalServerErrorException(
      `Brand relocation aborted: cascade left stale organization id on ${stale.join(', ')}.`,
    );
  }
  const unhandled = await findUnhandledOrgOnlyChildren(tx, brandId, destOrgId);
  if (unhandled.length > 0) {
    throw new InternalServerErrorException(
      `Brand relocation aborted: unhandled org-only child table(s) would keep the source org: ${unhandled.join(', ')}. Add them to SECOND_ORDER_TARGETS (or KNOWN_EXCLUDED_MODELS and AUDITOR_IGNORED_TABLES) in brand-org-cascade.constants.ts.`,
    );
  }
}

/**
 * Safety net: after the cascade, assert no brand-owned row still points at a stale
 * org. Part A verifies every configured table (correct field pairing). Part B
 * discovers ANY other dual-keyed table via information_schema and blocks the move
 * if it would orphan rows — so a forgotten/future table rolls back loudly instead
 * of silently splitting tenancy. Part C does the same for org-only children, which
 * carry an organization column and a foreign key to a moved parent but no brand
 * column: the configured ones are re-counted, and any other is found in the
 * catalog.
 */
export async function assertNoBrandOrgOrphans(
  tx: Prisma.TransactionClient,
  brandId: string,
  destOrgId: string,
): Promise<void> {
  const client = tx as unknown as Record<string, CascadeDelegate>;

  const stale: string[] = [];
  for (const target of FIRST_ORDER_TARGETS) {
    const remaining = await client[target.delegate].count({
      where: {
        [target.brandField]: brandId,
        [target.orgField]: { not: destOrgId },
      },
    });
    if (remaining > 0) {
      stale.push(`${target.delegate} (${remaining})`);
    }
  }
  if (stale.length > 0) {
    throw new InternalServerErrorException(
      `Brand relocation aborted: cascade left stale organization id on ${stale.join(', ')}.`,
    );
  }

  const knownTables = new Set<string>([
    ...FIRST_ORDER_TARGETS.map((target) => target.table),
    ...SECOND_ORDER_TARGETS.map((target) => target.table),
    ...AUDITOR_IGNORED_TABLES,
  ]);

  // sql-risk-audit: ignore raw-sql-review -- static information_schema introspection, no caller input interpolated.
  const candidates = await tx.$queryRaw<
    { table_name: string; brand_col: string; org_col: string }[]
  >`SELECT c1.table_name AS table_name, c1.column_name AS brand_col, c2.column_name AS org_col
     FROM information_schema.columns c1
     JOIN information_schema.columns c2
       ON c1.table_name = c2.table_name AND c1.table_schema = c2.table_schema
     WHERE c1.table_schema = 'public'
       AND c1.column_name ~* 'brand_?id$'
       AND c2.column_name ~* '(organization|org)_?id$'`;

  // Columns are camelCase (`brandId`, `organizationId`), so the identifiers are
  // quoted below and may carry capitals.
  const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const unhandled: string[] = [];
  for (const candidate of candidates) {
    if (knownTables.has(candidate.table_name)) {
      continue;
    }
    if (
      !IDENTIFIER.test(candidate.table_name) ||
      !IDENTIFIER.test(candidate.brand_col) ||
      !IDENTIFIER.test(candidate.org_col)
    ) {
      continue;
    }
    // sql-risk-audit: ignore raw-sql-review -- table/column identifiers are regex-validated to /^[A-Za-z_][A-Za-z0-9_]*$/ above and injected via Prisma.raw; brandId/destOrgId are bound as parameters.
    const rows = await tx.$queryRaw<
      { n: number }[]
    >`SELECT COUNT(*)::int AS n FROM ${Prisma.raw(`"${candidate.table_name}"`)} WHERE ${Prisma.raw(`"${candidate.brand_col}"`)} = ${brandId} AND ${Prisma.raw(`"${candidate.org_col}"`)} IS DISTINCT FROM ${destOrgId}`;
    const count = rows[0]?.n ?? 0;
    if (count > 0) {
      unhandled.push(
        `${candidate.table_name}.${candidate.brand_col}/${candidate.org_col} (${count})`,
      );
    }
  }
  if (unhandled.length > 0) {
    throw new InternalServerErrorException(
      `Brand relocation aborted: unhandled dual-keyed table(s) would be orphaned in the source org: ${unhandled.join(', ')}. Add them to FIRST_ORDER_TARGETS in brand-org-cascade.constants.ts.`,
    );
  }

  // Part C: org-only children (an organization column and a foreign key to a
  // moved parent, no brand column) must follow their parent too.
  await assertNoOrgOnlyChildOrphans(tx, brandId, destOrgId);
}

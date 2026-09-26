import { TENANT_QUERY_OPERATION_SET } from './discover-tenant-models';
import {
  getActiveBillingAccountScopes,
  getTenantContext,
  isCrossOrgUnsafe,
} from './tenant-context';

export type TenantIsolationReason =
  | 'billing-account-id-mismatch'
  | 'missing-organization-id'
  | 'organization-id-mismatch';

export type TenantGuardArgs = {
  args: unknown;
  /**
   * Model names (schema casing) that carry `billingAccountId` and are also
   * tenant models (#5217). Optional so every existing caller/test that
   * predates billing-account scope keeps its exact prior behavior.
   */
  billingAccountModelNames?: ReadonlySet<string>;
  isCloud: boolean;
  model: string | undefined;
  operation: string;
  tenantModelNames: ReadonlySet<string>;
};

export class TenantIsolationError extends Error {
  readonly model: string;
  readonly operation: string;
  readonly reason: TenantIsolationReason;

  constructor(
    model: string,
    operation: string,
    reason: TenantIsolationReason,
    message: string,
  ) {
    super(message);
    this.name = 'TenantIsolationError';
    this.model = model;
    this.operation = operation;
    this.reason = reason;
  }
}

/**
 * The one place `billingAccountId` may substitute for `organizationId` as
 * tenant proof (#5217) — reached **only** from inside the pre-existing
 * "no organizationId anywhere in this query" branch below. This is
 * deliberately narrow:
 *
 * - It never runs when the query carries an organizationId anywhere (where,
 *   data, create, AND, OR) — that query keeps going through the unchanged
 *   organizationId check below, exactly as it did before #5217. A write that
 *   merely *copies* an already-authorized `billingAccountId` into `data`
 *   alongside an organization-scoped `where` (e.g. settling a reservation)
 *   is therefore never required to have called `resolveBillingAccountAccess`
 *   — the organizationId proof already governs it, unchanged.
 * - When it does run, every `billingAccountId` found anywhere in the query
 *   (including inside an `OR`) must be an active, registered scope — so an
 *   `OR` cannot smuggle in an unregistered id next to a registered one.
 *
 * A single mixed `OR` branch that pairs an unregistered `billingAccountId`
 * with the caller's *own* valid `organizationId` in a sibling branch is a
 * pre-existing limitation of this flat, non-structural guard (the
 * organizationId branch below has always had the same "OR arm without any
 * scope key at all" gap for plain tenant models) — not something #5217
 * introduces. Closing it needs a structural, per-branch evaluator like the
 * static checker's `inspectDisjunction`, which is out of scope here. Nothing
 * in application code builds such a mixed `OR` today (`scopedWhere` and
 * `billingAccountScopedWhere` both write their key at the object's own
 * level, never inside a caller-supplied `OR`), and `check:tenant-scope`
 * would flag a hand-written one missing `isDeleted` per branch regardless.
 */
function assertBillingAccountScope(
  model: string,
  operation: string,
  args: unknown,
): void {
  const billingAccountIds = collectFieldValues(args, 'billingAccountId');
  const activeScopes = getActiveBillingAccountScopes();

  for (const billingAccountId of billingAccountIds) {
    if (!activeScopes.has(billingAccountId)) {
      throw new TenantIsolationError(
        model,
        operation,
        'billing-account-id-mismatch',
        `Tenant isolation: ${operation} on ${model} used billingAccountId ${billingAccountId} ` +
          'without an active BillingAccountScope in CLOUD mode.',
      );
    }
  }
}

export function assertTenantScopedQuery(input: TenantGuardArgs): void {
  if (!input.isCloud) {
    return;
  }

  if (isCrossOrgUnsafe()) {
    return;
  }

  const model = input.model;
  if (!model || !input.tenantModelNames.has(model)) {
    return;
  }

  if (!TENANT_QUERY_OPERATION_SET.has(input.operation)) {
    return;
  }

  // Unchanged from before #5217: collected across the whole query
  // (where/data/create/AND/OR), so a write that reassigns organizationId, or
  // an OR arm that names a different one, is still caught below exactly as
  // it always was.
  const organizationIds = collectFieldValues(input.args, 'organizationId');
  const tenantContext = getTenantContext();

  if (organizationIds.size === 0) {
    if (!tenantContext) {
      // No active tenant context: matches master exactly — background
      // workers, cron, webhooks, and other system paths that never call
      // runWithTenantContext are not enforced here (they establish their
      // own trust). A BillingAccountScope is never "active" outside a
      // tenant context either (see registerBillingAccountScope), so this
      // return is also what keeps a no-context billing-account write
      // (e.g. the BullMQ credit-deduction processor) from throwing.
      return;
    }

    // The query has no organizationId anywhere. Before #5217 this was
    // always `missing-organization-id`. Now a billing-account-capable model
    // may instead prove itself entirely through a registered
    // BillingAccountScope (#5217) — this is strictly additive: it only
    // fires in the branch that used to be an unconditional throw.
    if (model && input.billingAccountModelNames?.has(model)) {
      const billingAccountIds = collectFieldValues(
        input.args,
        'billingAccountId',
      );
      if (billingAccountIds.size > 0) {
        assertBillingAccountScope(model, input.operation, input.args);
        return;
      }
    }

    throw new TenantIsolationError(
      model,
      input.operation,
      'missing-organization-id',
      `Tenant isolation: ${input.operation} on ${model} is missing organizationId in CLOUD mode.`,
    );
  }

  if (!tenantContext) {
    return;
  }

  // Unchanged from before #5217, and — critically — never skipped because a
  // billingAccountId elsewhere in the query happened to be a valid,
  // registered scope. A billing-account match is never a substitute for
  // organizationId consistency when organizationId is actually present.
  for (const organizationId of organizationIds) {
    if (organizationId !== tenantContext.organizationId) {
      throw new TenantIsolationError(
        model,
        input.operation,
        'organization-id-mismatch',
        `Tenant isolation: ${input.operation} on ${model} used organizationId ${organizationId} but the request tenant is ${tenantContext.organizationId}.`,
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addFieldValue(value: unknown, ids: Set<string>): void {
  if (typeof value === 'string' && value.length > 0) {
    ids.add(value);
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (typeof value.equals === 'string' && value.equals.length > 0) {
    ids.add(value.equals);
  }

  if (!Array.isArray(value.in)) {
    return;
  }

  for (const entry of value.in) {
    if (typeof entry === 'string' && entry.length > 0) {
      ids.add(entry);
    }
  }
}

/**
 * Collects every value assigned to `fieldName` (direct, `{ equals }`, or
 * `{ in: [...] }`) anywhere a Prisma query's `where`/`data`/`create`/`AND`/`OR`
 * would carry it. Shared by the organizationId and billingAccountId checks —
 * same traversal, same depth guard, different field name.
 */
function collectFieldValues(
  node: unknown,
  fieldName: string,
  depth = 0,
): Set<string> {
  const ids = new Set<string>();
  visitFieldValues(node, fieldName, ids, depth);
  return ids;
}

function visitFieldValues(
  node: unknown,
  fieldName: string,
  ids: Set<string>,
  depth: number,
): void {
  if (depth > 8 || node == null) {
    return;
  }

  if (Array.isArray(node)) {
    for (const entry of node) {
      visitFieldValues(entry, fieldName, ids, depth + 1);
    }
    return;
  }

  if (!isRecord(node)) {
    return;
  }

  if (fieldName in node) {
    addFieldValue(node[fieldName], ids);
  }

  visitFieldValues(node.where, fieldName, ids, depth + 1);
  visitFieldValues(node.data, fieldName, ids, depth + 1);
  visitFieldValues(node.create, fieldName, ids, depth + 1);
  visitFieldValues(node.AND, fieldName, ids, depth + 1);
  visitFieldValues(node.OR, fieldName, ids, depth + 1);
}

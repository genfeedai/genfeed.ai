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
 * Validates a query that carries a `billingAccountId` filter against the
 * `BillingAccountScope`s registered as active for the current tenant context
 * (#5217).
 *
 * Returns `true` when the query was authorized this way — the caller must
 * skip the organizationId check below, because a billing-account-shared row
 * legitimately has no organizationId, or one belonging to a different linked
 * organization. Returns `false` when the query carries no billingAccountId at
 * all, so the caller falls through to the unchanged organizationId check.
 * Throws when a billingAccountId is present but not an active scope — this
 * never falls through, so a spoofed or stale billingAccountId cannot be
 * rescued by an incidentally-matching organizationId.
 */
function checkBillingAccountScope(
  model: string,
  operation: string,
  args: unknown,
): boolean {
  const billingAccountIds = collectFieldValues(args, 'billingAccountId');
  if (billingAccountIds.size === 0) {
    return false;
  }

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

  return true;
}

export function assertTenantScopedQuery(input: TenantGuardArgs): void {
  if (!input.isCloud) {
    return;
  }

  if (isCrossOrgUnsafe()) {
    return;
  }

  const model = input.model;

  // A verified BillingAccountScope authorizes this exact query and
  // deliberately bypasses the organizationId check below — billing-account
  // rows are shared across the organizations linked to that account by
  // design (#5217). This only ever adds a requirement: a query with no
  // billingAccountId filter is completely unaffected and falls through to
  // the pre-existing organizationId rule.
  if (
    model &&
    TENANT_QUERY_OPERATION_SET.has(input.operation) &&
    input.billingAccountModelNames?.has(model) &&
    checkBillingAccountScope(model, input.operation, input.args)
  ) {
    return;
  }

  if (!model || !input.tenantModelNames.has(model)) {
    return;
  }

  if (!TENANT_QUERY_OPERATION_SET.has(input.operation)) {
    return;
  }

  const organizationIds = collectFieldValues(input.args, 'organizationId');
  const tenantContext = getTenantContext();

  if (organizationIds.size === 0) {
    if (!tenantContext) {
      return;
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

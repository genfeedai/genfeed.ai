import { TENANT_QUERY_OPERATION_SET } from './discover-tenant-models';
import { getTenantContext, isCrossOrgUnsafe } from './tenant-context';

export type TenantIsolationReason =
  | 'missing-organization-id'
  | 'organization-id-mismatch';

export type TenantGuardArgs = {
  args: unknown;
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

  const organizationIds = collectOrganizationIds(input.args);
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

function addOrganizationIdValue(value: unknown, ids: Set<string>): void {
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

function collectOrganizationIds(node: unknown, depth = 0): Set<string> {
  const ids = new Set<string>();
  visitOrganizationIds(node, ids, depth);
  return ids;
}

function visitOrganizationIds(
  node: unknown,
  ids: Set<string>,
  depth: number,
): void {
  if (depth > 8 || node == null) {
    return;
  }

  if (Array.isArray(node)) {
    for (const entry of node) {
      visitOrganizationIds(entry, ids, depth + 1);
    }
    return;
  }

  if (!isRecord(node)) {
    return;
  }

  if ('organizationId' in node) {
    addOrganizationIdValue(node.organizationId, ids);
  }

  visitOrganizationIds(node.where, ids, depth + 1);
  visitOrganizationIds(node.data, ids, depth + 1);
  visitOrganizationIds(node.create, ids, depth + 1);
  visitOrganizationIds(node.AND, ids, depth + 1);
  visitOrganizationIds(node.OR, ids, depth + 1);
}

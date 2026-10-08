import { readFileSync } from 'node:fs';

export const TENANT_EVIDENCE_OPERATIONS = [
  'aggregate',
  'count',
  'delete',
  'deleteMany',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
];
let tenantModels;
export function schemaModels() {
  if (!tenantModels) {
    const schema = readFileSync(
      new URL('../../../packages/prisma/prisma/schema.prisma', import.meta.url),
      'utf8',
    );
    tenantModels = new Set(
      [...schema.matchAll(/^model ([A-Za-z_][A-Za-z0-9_]*) \{/gm)].map(
        (match) => match[1],
      ),
    );
    if (!tenantModels.size) {
      tenantModels = undefined;
      throw new Error('Missing tenant diagnostic schema models');
    }
  }
  return tenantModels;
}

export const TENANT_EVIDENCE_REASONS = [
  'missing-organization-id',
  'organization-id-mismatch',
  'billing-account-id-mismatch',
];
export const MAX_TENANT_FAILURES = 10000;
export function validateTenantFailure(model, operation, reason) {
  if (
    !schemaModels().has(model) ||
    !TENANT_EVIDENCE_OPERATIONS.includes(operation) ||
    !TENANT_EVIDENCE_REASONS.includes(reason)
  )
    throw new Error('Invalid tenant guard evidence');
}

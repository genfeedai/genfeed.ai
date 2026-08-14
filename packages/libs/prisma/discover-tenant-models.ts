/**
 * Shared tenant-model inventory for the compile-time tenant-scope ratchet and
 * the runtime Prisma query guard. A model is tenant-scoped when it carries
 * both `organizationId` and `isDeleted`.
 */

export type TenantModel = {
  delegate: string;
  model: string;
};

export type TenantModelFieldInventory = {
  allFields: readonly string[];
};

export const TENANT_QUERY_OPERATIONS = [
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
] as const;

export type TenantQueryOperation = (typeof TENANT_QUERY_OPERATIONS)[number];

export const TENANT_QUERY_OPERATION_SET: ReadonlySet<string> = new Set(
  TENANT_QUERY_OPERATIONS,
);

export function isTenantScopedFieldSet(fieldNames: readonly string[]): boolean {
  return (
    fieldNames.includes('organizationId') && fieldNames.includes('isDeleted')
  );
}

export function discoverTenantModels(schema: string): TenantModel[] {
  const tenantModels: TenantModel[] = [];
  const modelPattern =
    /^[ \t]*model\s+([A-Za-z_]\w*)\s+\{([\s\S]*?)^[ \t]*\}/gmu;

  for (const match of schema.matchAll(modelPattern)) {
    const [, model, body] = match;

    if (!model || !body) {
      continue;
    }

    const fieldNames = [...body.matchAll(/^\s*([A-Za-z_]\w*)\s+\S+/gmu)].map(
      (fieldMatch) => fieldMatch[1] ?? '',
    );

    if (!isTenantScopedFieldSet(fieldNames)) {
      continue;
    }

    tenantModels.push({
      delegate: lowerFirst(model),
      model,
    });
  }

  return sortTenantModels(tenantModels);
}

export function tenantModelsFromMetadata(
  metadata: Readonly<Record<string, TenantModelFieldInventory>>,
): TenantModel[] {
  const tenantModels: TenantModel[] = [];

  for (const [model, inventory] of Object.entries(metadata)) {
    if (!isTenantScopedFieldSet(inventory.allFields)) {
      continue;
    }

    tenantModels.push({
      delegate: lowerFirst(model),
      model,
    });
  }

  return sortTenantModels(tenantModels);
}

function lowerFirst(value: string): string {
  return value.length === 0
    ? value
    : `${value[0]?.toLowerCase()}${value.slice(1)}`;
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function sortTenantModels(tenantModels: TenantModel[]): TenantModel[] {
  return tenantModels.sort(
    (left, right) =>
      compareText(left.delegate, right.delegate) ||
      compareText(left.model, right.model),
  );
}

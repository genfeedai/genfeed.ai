/**
 * Shared tenant-model inventory for the compile-time tenant-scope ratchet and
 * the runtime Prisma query guard. A model is tenant-scoped when it carries
 * both `organizationId` and `isDeleted`.
 *
 * A tenant model that also carries `billingAccountId` is "billing-account
 * capable" (#5217): its rows may be shared across the organizations linked to
 * one billing account, so `organizationId` is not always the right proof of
 * access. `discoverBillingAccountModelNames` / `billingAccountModelNamesFromMetadata`
 * identify that subset so the static checker and the runtime guard can accept
 * `billingAccountScopedWhere` as an alternative proof, without touching the
 * organization-scope rule for every other tenant model.
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

/**
 * A model is "billing-account capable" when it carries `billingAccountId` at
 * all. Whether it is also a tenant model (has `organizationId`) is decided
 * separately — the checker and the runtime guard only grant the
 * `billingAccountScopedWhere` alternative to models that are both.
 */
export function isBillingAccountScopedFieldSet(
  fieldNames: readonly string[],
): boolean {
  return fieldNames.includes('billingAccountId');
}

type SchemaModelFields = {
  fieldNames: string[];
  model: string;
};

function parseSchemaModelFields(schema: string): SchemaModelFields[] {
  const models: SchemaModelFields[] = [];
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

    models.push({ fieldNames, model });
  }

  return models;
}

export function discoverTenantModels(schema: string): TenantModel[] {
  const tenantModels: TenantModel[] = [];

  for (const { fieldNames, model } of parseSchemaModelFields(schema)) {
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

/**
 * Model names (schema `model X` casing) that carry `billingAccountId`,
 * regardless of whether they are also tenant models. Callers that need the
 * "billing-account capable tenant model" set intersect this with
 * `discoverTenantModels`'s output.
 */
export function discoverBillingAccountModelNames(
  schema: string,
): ReadonlySet<string> {
  const modelNames = new Set<string>();

  for (const { fieldNames, model } of parseSchemaModelFields(schema)) {
    if (isBillingAccountScopedFieldSet(fieldNames)) {
      modelNames.add(model);
    }
  }

  return modelNames;
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

/** Metadata-driven counterpart of `discoverBillingAccountModelNames`. */
export function billingAccountModelNamesFromMetadata(
  metadata: Readonly<Record<string, TenantModelFieldInventory>>,
): ReadonlySet<string> {
  const modelNames = new Set<string>();

  for (const [model, inventory] of Object.entries(metadata)) {
    if (isBillingAccountScopedFieldSet(inventory.allFields)) {
      modelNames.add(model);
    }
  }

  return modelNames;
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

export interface JsonApiRelationshipReference {
  id: string;
  [key: string]: unknown;
}

export type JsonApiRelationshipValue =
  | string
  | JsonApiRelationshipReference
  | null
  | undefined;

export function isJsonApiRelationshipReference(
  value: unknown,
): value is JsonApiRelationshipReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === 'string'
  );
}

export function normalizeJsonApiRelationshipValue(
  value: JsonApiRelationshipValue,
): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (isJsonApiRelationshipReference(value)) {
    return value.id;
  }

  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function normalizeJsonApiRelationshipGraph<T>(value: T): T {
  return normalizeNode(value) as T;
}

function normalizeNode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeNode(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  if (
    isJsonApiRelationshipReference(value) &&
    Object.keys(value).length === 1
  ) {
    return value.id;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeNode(item)]),
  );
}

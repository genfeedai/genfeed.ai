import type {
  ReplicateVariantSelector,
  ReviewedVariantCompositePart,
  ReviewedVariantRule,
  VariantScalar,
} from '@genfeedai/contracts/interfaces';
import {
  parseReviewedVariantRules,
  variantOwn,
  variantRecord,
  variantRuleRange,
  variantScalar,
} from './variant-rule-validation';

function scalarType(
  property: Record<string, unknown>,
): 'string' | 'number' | 'boolean' | null {
  if (property.type === 'integer') return 'number';
  return property.type === 'string' ||
    property.type === 'number' ||
    property.type === 'boolean'
    ? property.type
    : null;
}
function inSchema(
  value: VariantScalar,
  property: Record<string, unknown>,
): boolean {
  if (typeof value !== scalarType(property)) return false;
  if (Array.isArray(property.enum) && !property.enum.includes(value))
    return false;
  if (typeof value === 'string' && !Array.isArray(property.enum)) return false;
  if (typeof value === 'number') {
    if (property.type === 'integer' && !Number.isInteger(value)) return false;
    if (typeof property.minimum === 'number' && value < property.minimum)
      return false;
    if (typeof property.maximum === 'number' && value > property.maximum)
      return false;
  }
  return true;
}
function presenceType(
  property: Record<string, unknown>,
): 'array' | 'string' | null {
  if (
    property.type === 'array' &&
    variantRecord(property.items) &&
    property.items.type === 'string' &&
    (property.default === undefined ||
      (Array.isArray(property.default) && property.default.length === 0))
  )
    return 'array';
  if (
    property.type === 'string' &&
    property.format === 'uri' &&
    (property.default === undefined ||
      property.default === null ||
      property.default === '')
  )
    return 'string';
  return null;
}
function mapInput(
  key: string,
  type: 'string' | 'number' | 'boolean',
): VariantScalar | null {
  if (type === 'string') return key;
  if (type === 'number')
    return key.trim() && Number.isFinite(Number(key)) ? Number(key) : null;
  return key === 'true' ? true : key === 'false' ? false : null;
}
function freezePart(
  part: { field: string; mode: 'value' | 'presence' },
  domains: VariantScalar[],
  properties: Record<string, unknown>,
): ReviewedVariantCompositePart | null {
  const property = properties[part.field];
  if (!variantRecord(property)) return null;
  if (part.mode === 'presence') {
    const fieldType = presenceType(property);
    return fieldType ? { ...part, fieldType } : null;
  }
  const fieldType = scalarType(property);
  if (!fieldType || !domains.every((value) => inSchema(value, property)))
    return null;
  const defaultValue = property.default;
  if (
    defaultValue !== undefined &&
    (!variantScalar(defaultValue) || !domains.includes(defaultValue))
  )
    return null;
  return {
    ...part,
    fieldType,
    ...(defaultValue !== undefined
      ? { default: defaultValue as VariantScalar }
      : {}),
  };
}

/** Bind the checked-in selector to the provider's observed schema before it is approvable. */
export function freezeReplicateVariantRule(
  entry: ReplicateVariantSelector,
  properties: Record<string, unknown>,
): ReviewedVariantRule | null {
  const { derive } = entry;
  let frozen: ReviewedVariantRule | null = null;
  if (derive.kind === 'composite') {
    const parts = derive.parts.map((part, index) =>
      freezePart(
        part,
        derive.cases.map((item) => item.when[index]).filter(variantScalar),
        properties,
      ),
    );
    if (parts.some((part) => part === null)) return null;
    frozen = {
      ...entry,
      derive: { ...derive, parts: parts as ReviewedVariantCompositePart[] },
    };
  } else {
    const property = properties[derive.field];
    if (!variantRecord(property)) return null;
    if (derive.kind === 'presence') {
      const fieldType = presenceType(property);
      if (!fieldType) return null;
      frozen = { ...entry, derive: { ...derive, fieldType } };
    } else {
      const fieldType = scalarType(property);
      if (
        !fieldType ||
        !Object.keys(derive.valueMap).every((key) => {
          const value = mapInput(key, fieldType);
          return value !== null && inSchema(value, property);
        })
      )
        return null;
      const defaultValue = property.default;
      if (
        defaultValue !== undefined &&
        (!variantScalar(defaultValue) ||
          !variantOwn(derive.valueMap, String(defaultValue)) ||
          !inSchema(defaultValue, property))
      )
        return null;
      frozen = {
        ...entry,
        derive: {
          ...derive,
          fieldType,
          ...(defaultValue !== undefined
            ? { default: defaultValue as VariantScalar }
            : {}),
        },
      };
    }
  }
  return parseReviewedVariantRules([frozen])?.[0] ?? null;
}
export function variantCriterionSupported(
  rule: ReviewedVariantRule,
  value: unknown,
): value is VariantScalar {
  return variantScalar(value) && variantRuleRange(rule).includes(value);
}

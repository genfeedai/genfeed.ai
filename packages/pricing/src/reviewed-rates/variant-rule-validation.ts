import type {
  ReviewedVariantRule,
  VariantScalar,
} from '@genfeedai/contracts/interfaces';

export function variantOwn(value: object, key: string): boolean {
  return Object.getOwnPropertyDescriptor(value, key) !== undefined;
}
export function variantRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function variantScalar(value: unknown): value is VariantScalar {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}
function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function name(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function valueType(value: unknown): boolean {
  return value === 'string' || value === 'number' || value === 'boolean';
}
function defaultMatches(value: Record<string, unknown>): boolean {
  return (
    value.default === undefined ||
    (variantScalar(value.default) && typeof value.default === value.fieldType)
  );
}
function validField(value: Record<string, unknown>): boolean {
  if (
    !onlyKeys(value, ['kind', 'field', 'valueMap', 'fieldType', 'default']) ||
    !name(value.field) ||
    !valueType(value.fieldType) ||
    !defaultMatches(value) ||
    !variantRecord(value.valueMap)
  )
    return false;
  const entries = Object.entries(value.valueMap);
  if (
    !entries.length ||
    !entries.every(
      ([key, selector]) => key.length > 0 && variantScalar(selector),
    )
  )
    return false;
  if (
    value.fieldType === 'boolean' &&
    entries.some(([key]) => key !== 'true' && key !== 'false')
  )
    return false;
  if (
    value.fieldType === 'number' &&
    entries.some(([key]) => !key.trim() || !Number.isFinite(Number(key)))
  )
    return false;
  return (
    value.default === undefined ||
    variantOwn(value.valueMap, String(value.default))
  );
}
function validPresence(value: Record<string, unknown>): boolean {
  return (
    onlyKeys(value, [
      'kind',
      'field',
      'fieldType',
      'whenPresent',
      'whenAbsent',
    ]) &&
    name(value.field) &&
    (value.fieldType === 'array' || value.fieldType === 'string') &&
    variantScalar(value.whenPresent) &&
    variantScalar(value.whenAbsent) &&
    value.whenPresent !== value.whenAbsent
  );
}
function validPart(value: unknown): boolean {
  if (
    !variantRecord(value) ||
    !onlyKeys(value, ['field', 'mode', 'fieldType', 'default']) ||
    !name(value.field)
  )
    return false;
  if (value.mode === 'presence')
    return (
      (value.fieldType === 'array' || value.fieldType === 'string') &&
      !variantOwn(value, 'default')
    );
  return (
    value.mode === 'value' &&
    valueType(value.fieldType) &&
    defaultMatches(value)
  );
}
function validComposite(value: Record<string, unknown>): boolean {
  if (
    !onlyKeys(value, ['kind', 'parts', 'cases']) ||
    !Array.isArray(value.parts) ||
    !value.parts.length ||
    !value.parts.every(validPart) ||
    !Array.isArray(value.cases) ||
    !value.cases.length
  )
    return false;
  const parts = value.parts as Record<string, unknown>[];
  if (new Set(parts.map((part) => part.field)).size !== parts.length)
    return false;
  const combinations = new Set<string>();
  for (const item of value.cases) {
    if (
      !variantRecord(item) ||
      !onlyKeys(item, ['when', 'selector']) ||
      !variantScalar(item.selector) ||
      !Array.isArray(item.when) ||
      item.when.length !== parts.length
    )
      return false;
    if (
      !item.when.every(
        (input, index) =>
          variantScalar(input) &&
          typeof input ===
            (parts[index]?.mode === 'presence'
              ? 'boolean'
              : parts[index]?.fieldType),
      )
    )
      return false;
    const key = JSON.stringify(item.when);
    if (combinations.has(key)) return false;
    combinations.add(key);
  }
  return parts.every(
    (part, index) =>
      part.default === undefined ||
      (value.cases as Record<string, unknown>[]).some(
        (item) => (item.when as unknown[])[index] === part.default,
      ),
  );
}
function validRule(value: unknown): boolean {
  if (
    !variantRecord(value) ||
    !onlyKeys(value, ['criterionTitle', 'selectorKey', 'derive']) ||
    !name(value.criterionTitle) ||
    !name(value.selectorKey) ||
    !variantRecord(value.derive)
  )
    return false;
  switch (value.derive.kind) {
    case 'field':
      return validField(value.derive);
    case 'presence':
      return validPresence(value.derive);
    case 'composite':
      return validComposite(value.derive);
    default:
      return false;
  }
}

/** Parse persisted financial metadata without accepting unknown fields or duplicate keys. */
export function parseReviewedVariantRules(
  value: unknown,
): ReviewedVariantRule[] | null {
  if (!Array.isArray(value) || !value.length || !value.every(validRule))
    return null;
  const rules = value as ReviewedVariantRule[];
  if (new Set(rules.map((rule) => rule.selectorKey)).size !== rules.length)
    return null;
  return structuredClone(rules);
}
export function variantRuleRange(rule: ReviewedVariantRule): VariantScalar[] {
  const derive = rule.derive;
  switch (derive.kind) {
    case 'field':
      return Object.values(derive.valueMap);
    case 'presence':
      return [derive.whenPresent, derive.whenAbsent];
    case 'composite':
      return derive.cases.map((item) => item.selector);
  }
}
export function variantRuleFields(
  rules: readonly ReviewedVariantRule[],
): Set<string> {
  const fields = new Set(
    rules.flatMap((rule) =>
      rule.derive.kind === 'composite'
        ? rule.derive.parts.map((part) => part.field)
        : [rule.derive.field],
    ),
  );
  if (fields.has('generate_audio')) fields.add('audio');
  return fields;
}

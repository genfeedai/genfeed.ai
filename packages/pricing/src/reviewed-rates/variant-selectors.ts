import type {
  ReviewedVariantRule,
  VariantEvidence,
  VariantScalar,
  VariantSelectorResolution,
} from '@genfeedai/contracts/interfaces';
import {
  parseReviewedVariantRules,
  variantOwn,
  variantRuleRange,
  variantScalar,
} from './variant-rule-validation';

function presence(value: unknown, type: 'array' | 'string'): boolean | null {
  if (value === undefined) return false;
  if (type === 'string')
    return typeof value === 'string' && value.trim().length > 0 ? true : null;
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string' && item.trim().length > 0)
  )
    return null;
  return value.length > 0;
}
function fieldInput(
  input: Readonly<Record<string, unknown>>,
  field: string,
): unknown {
  return variantOwn(input, field) ? input[field] : undefined;
}
function deriveValue(
  rule: ReviewedVariantRule,
  input: Readonly<Record<string, unknown>>,
): VariantScalar | null {
  const derive = rule.derive;
  if (derive.kind === 'presence') {
    const value = presence(fieldInput(input, derive.field), derive.fieldType);
    return value === null
      ? null
      : value
        ? derive.whenPresent
        : derive.whenAbsent;
  }
  if (derive.kind === 'field') {
    const raw = fieldInput(input, derive.field);
    const value = raw === undefined ? derive.default : raw;
    if (
      !variantScalar(value) ||
      typeof value !== derive.fieldType ||
      !variantOwn(derive.valueMap, String(value))
    )
      return null;
    return derive.valueMap[String(value)] ?? null;
  }
  const values = derive.parts.map((part) => {
    const raw = fieldInput(input, part.field);
    if (part.mode === 'presence')
      return presence(raw, part.fieldType as 'array' | 'string');
    const value = raw === undefined ? part.default : raw;
    return variantScalar(value) && typeof value === part.fieldType
      ? value
      : null;
  });
  if (values.some((value) => value === null)) return null;
  const matches = derive.cases.filter((item) =>
    item.when.every((value, index) => value === values[index]),
  );
  return matches.length === 1 ? (matches[0]?.selector ?? null) : null;
}
function sourceLabel(rule: ReviewedVariantRule): string {
  return rule.derive.kind === 'composite'
    ? rule.derive.parts.map((part) => part.field).join('+')
    : rule.derive.field;
}

function missingField(
  rule: ReviewedVariantRule,
  input: Readonly<Record<string, unknown>>,
): string | undefined {
  const derive = rule.derive;
  if (derive.kind === 'field')
    return fieldInput(input, derive.field) === undefined &&
      derive.default === undefined
      ? derive.field
      : undefined;
  if (derive.kind === 'composite')
    return derive.parts.find(
      (part) =>
        part.mode === 'value' &&
        fieldInput(input, part.field) === undefined &&
        part.default === undefined,
    )?.field;
  return undefined;
}

/** Only transient dispatch input or explicit internal frozen evidence can establish a variant. */
export function resolveVariantSelectors(
  rules: readonly ReviewedVariantRule[],
  evidence: VariantEvidence | undefined,
  supplied: Record<string, VariantScalar> = {},
): VariantSelectorResolution {
  const parsed = parseReviewedVariantRules(rules);
  if (!parsed)
    return {
      status: 'unresolved',
      reason: 'Reviewed variant rules are invalid',
    };
  if (!evidence)
    return {
      status: 'unresolved',
      reason: 'Variant pricing requires dispatched provider input',
    };
  const selectors = { ...supplied };
  for (const rule of parsed) {
    if (evidence.kind === 'frozen') {
      if (
        !variantRuleRange(rule).includes(
          supplied[rule.selectorKey] as VariantScalar,
        )
      )
        return {
          status: 'unresolved',
          reason: `Frozen ${rule.selectorKey} is missing or outside the reviewed domain`,
        };
      continue;
    }
    const missing = missingField(rule, evidence.input);
    if (missing)
      return {
        status: 'unresolved',
        reason: `Dispatched ${missing} is required for ${rule.selectorKey}`,
      };
    const value = deriveValue(rule, evidence.input);
    const field = sourceLabel(rule);
    if (value === null)
      return {
        status: 'unresolved',
        reason: `Dispatched ${field} is outside the reviewed ${rule.selectorKey} domain`,
      };
    if (
      variantOwn(supplied, rule.selectorKey) &&
      supplied[rule.selectorKey] !== value
    )
      return {
        status: 'unresolved',
        reason: `Selected ${rule.selectorKey} disagrees with the dispatched ${field}`,
      };
    selectors[rule.selectorKey] = value;
  }
  return { status: 'ok', selectors };
}

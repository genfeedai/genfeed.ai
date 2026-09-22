import type { TypedDecisionProviderName } from '../interfaces/ai/typed-decision.interface';

/**
 * Operator-facing labels for the typed-decision provider setting (#4908).
 *
 * The key set is the exhaustive provider list, so adding a member to
 * `TypedDecisionProviderName` fails to compile until it has a label and shows
 * up in the admin select.
 */
export const TYPED_DECISION_PROVIDER_LABELS: Record<
  TypedDecisionProviderName,
  string
> = {
  jev: 'Jev (TypeSafe AI)',
  none: 'Off — deterministic paths only',
};

/** Every selectable provider, for validation and the admin select. */
export const TYPED_DECISION_PROVIDER_NAMES = Object.keys(
  TYPED_DECISION_PROVIDER_LABELS,
) as TypedDecisionProviderName[];

/**
 * What a deployment gets before an operator touches anything: the
 * deterministic paths the product already had, with no hosted vendor in them.
 */
export const DEFAULT_TYPED_DECISION_PROVIDER: TypedDecisionProviderName =
  'none';

/**
 * Narrow a persisted string column to a provider name.
 *
 * Fails closed to `none`: a row written by a newer deployment, or corrupted by
 * hand, must never bind a provider this process does not recognise.
 */
export function parseTypedDecisionProvider(
  value: unknown,
): TypedDecisionProviderName {
  return typeof value === 'string' &&
    (TYPED_DECISION_PROVIDER_NAMES as string[]).includes(value)
    ? (value as TypedDecisionProviderName)
    : DEFAULT_TYPED_DECISION_PROVIDER;
}

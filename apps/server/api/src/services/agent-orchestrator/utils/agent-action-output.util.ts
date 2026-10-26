/**
 * An action's output is validated against its contract as a JSON document,
 * which rejects `undefined` and other non-JSON values a handler leaves in an
 * object (an optional field copied across as `undefined`). By then the work
 * has been done, so one stray field failed the whole run and its execution.
 * Round-trip the result through JSON, as persisting it would, before the
 * contract sees it.
 */
export function toActionJsonOutput<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

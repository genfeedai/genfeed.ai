export type ConditionBranchOutput =
  | { isTaken: boolean; isBranch: true; value: unknown }
  | { isBranch: false };

/**
 * A condition node emits `{ data, result, value }`, while its edges name the
 * branch they leave from (`true` / `false`). The branch handle carries the
 * node's passthrough `data` and is only live for the branch that was taken.
 */
export function resolveConditionBranchOutput(
  sourceHandle: string | undefined,
  output: unknown,
): ConditionBranchOutput {
  if (
    (sourceHandle !== 'true' && sourceHandle !== 'false') ||
    !output ||
    typeof output !== 'object' ||
    sourceHandle in output ||
    !('data' in output) ||
    typeof (output as { result?: unknown }).result !== 'boolean'
  ) {
    return { isBranch: false };
  }

  const { data, result } = output as { data: unknown; result: boolean };
  return {
    isBranch: true,
    isTaken: String(result) === sourceHandle,
    value: data,
  };
}

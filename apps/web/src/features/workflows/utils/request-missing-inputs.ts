import {
  readMissingWorkflowInputs,
  useExecutionStore,
} from '@genfeedai/workflows/ui/stores';

/**
 * Hands a refused page-level run to the editor's recovery dialog.
 *
 * When `error` is the API's typed `WORKFLOW_MISSING_INPUT` answer, the dialog
 * opens for exactly the inputs it lists, and `run` is called again with the
 * values the user entered merged over `inputValues`. Cancelling sends nothing.
 *
 * @returns `true` when the dialog took the error; `false` for any other
 * failure, which the caller reports itself.
 */
export function requestMissingWorkflowInputs(
  error: unknown,
  inputValues: Record<string, unknown>,
  run: (inputValues: Record<string, unknown>) => Promise<void>,
): boolean {
  const missingInputs = readMissingWorkflowInputs(error);
  if (!missingInputs) {
    return false;
  }

  useExecutionStore.getState().requestMissingInputs({
    inputValues,
    missingInputs,
    target: { kind: 'run', run },
  });

  return true;
}

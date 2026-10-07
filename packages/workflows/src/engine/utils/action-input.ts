import { readRecord } from '@genfeedai/contracts/constants/type-guards.constant';
/**
 * Builds the exact JSON object delivered to a Genfeed action implementation.
 * Persisted engine metadata is removed before payload, node config, and edge
 * inputs are merged in increasing precedence order.
 */
export function buildActionExecutionInput(
  nodeConfig: Record<string, unknown>,
  inputs: ReadonlyMap<string, unknown> | Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const {
    actionId: _actionId,
    inputVariableKeys: _inputVariableKeys,
    parameters,
    payload,
    ...config
  } = nodeConfig;

  const input = {
    ...readRecord(parameters),
    ...readRecord(payload),
    ...config,
    ...(inputs instanceof Map ? Object.fromEntries(inputs) : inputs),
  };

  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

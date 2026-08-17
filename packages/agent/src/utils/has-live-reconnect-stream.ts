export interface LiveReconnectStreamInput {
  isStreaming: boolean;
  pendingUiActionCount: number;
}

/**
 * Whether reconnect should keep the client-owned turn and skip snapshot
 * restore. Distinct from thread-switch `hasLiveLocalRun`, which also treats
 * a bare `activeRunId` as live. On reconnect that id is the recovery case:
 * the tab was offline, the server finished, and an empty transcript still
 * needs the snapshot (#3006).
 */
export function hasLiveReconnectStream(
  input: LiveReconnectStreamInput,
): boolean {
  return input.isStreaming || input.pendingUiActionCount > 0;
}

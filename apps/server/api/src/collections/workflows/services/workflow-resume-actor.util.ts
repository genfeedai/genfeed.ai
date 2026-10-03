/** Require the persisted run actor without changing its opaque identity. */
export function requireRecordedWorkflowActor(
  executionId: string,
  userId: unknown,
): string {
  if (typeof userId !== 'string' || !/\S/.test(userId)) {
    throw new Error(
      `Workflow execution ${executionId} has no recorded actor; resume is blocked.`,
    );
  }
  return userId;
}

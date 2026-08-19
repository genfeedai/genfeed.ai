import type { IBatchItemAssignee } from '@genfeedai/interfaces';

export interface BatchItemAssigneeUser {
  firstName?: string | null;
  handle?: string | null;
  id: string;
  lastName?: string | null;
  name?: string | null;
}

export function serializeBatchItemAssignee(
  user: BatchItemAssigneeUser,
): IBatchItemAssignee {
  const fullName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    displayName:
      user.name ||
      fullName ||
      user.handle ||
      `Team member ${user.id.slice(0, 8)}`,
    handle: user.handle ?? '',
    id: user.id,
  };
}

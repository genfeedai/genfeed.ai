export interface TurboRunItemAssigneeProjection {
  displayName: string;
  handle: string;
  id: string;
}

export interface TurboRunItemAssigneeUser {
  firstName?: string | null;
  handle?: string | null;
  id: string;
  lastName?: string | null;
  name?: string | null;
}

export function serializeTurboRunItemAssignee(
  user: TurboRunItemAssigneeUser,
): TurboRunItemAssigneeProjection {
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

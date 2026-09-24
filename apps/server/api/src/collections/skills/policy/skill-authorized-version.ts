export interface AuthorizedVersionPointer {
  audience: string | null;
  currentVersionId: string | null;
  ownerKind: string | null;
  publishedVersionId: string | null;
  sharedVersionId: string | null;
}

export interface AuthorizedVersionChoice {
  assignmentVersionId?: string | null;
  canEdit: boolean;
  grantVersionId?: string | null;
  pinnedVersionId?: string | null;
  pointer: AuthorizedVersionPointer;
}

/**
 * Execution uses the pinned assignment, grant, or publication.
 * A newer current draft stays off this path until activation moves the pointer.
 * Editors still resolve the draft only when no shared, published, or granted pointer exists.
 */
export function chooseAuthorizedVersionId(
  choice: AuthorizedVersionChoice,
): string | null {
  if (choice.pinnedVersionId) return choice.pinnedVersionId;
  if (choice.assignmentVersionId) return choice.assignmentVersionId;
  if (choice.grantVersionId) return choice.grantVersionId;
  if (
    choice.pointer.audience === 'organization' &&
    choice.pointer.sharedVersionId
  ) {
    return choice.pointer.sharedVersionId;
  }
  if (
    choice.pointer.audience === 'public' &&
    choice.pointer.publishedVersionId
  ) {
    return choice.pointer.publishedVersionId;
  }
  if (choice.canEdit || choice.pointer.ownerKind === 'system') {
    return choice.pointer.currentVersionId;
  }
  return null;
}

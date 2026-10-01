export interface AgentChatComposerOccupancy {
  readonly hasContent: boolean;
  readonly isFocused: boolean;
}

export function shouldCollapseEmptySurfaceComposer({
  hasAttachments,
  hasError,
  hasFollowUps,
  hasPendingInput,
  isEmptyConversation,
  isForceExpanded,
  isRunActive,
  isScrolledToBottom,
  occupancy,
  placement,
}: {
  hasAttachments: boolean;
  hasError: boolean;
  hasFollowUps: boolean;
  hasPendingInput: boolean;
  isEmptyConversation: boolean;
  isForceExpanded: boolean;
  isRunActive: boolean;
  isScrolledToBottom: boolean;
  occupancy: AgentChatComposerOccupancy;
  placement: 'dock' | 'overlay' | 'surface' | undefined;
}): boolean {
  if (placement === 'dock' || placement === 'overlay') {
    return false;
  }

  if (
    isEmptyConversation ||
    isScrolledToBottom ||
    isForceExpanded ||
    occupancy.hasContent ||
    occupancy.isFocused ||
    hasAttachments ||
    isRunActive ||
    hasFollowUps ||
    hasError ||
    hasPendingInput
  ) {
    return false;
  }

  return true;
}

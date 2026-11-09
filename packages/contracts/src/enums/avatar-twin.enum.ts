/** Mirrors the Prisma `AvatarTwinStatus` labels exactly. */
export enum AvatarTwinStatus {
  UPLOADING = 'UPLOADING',
  TRAINING = 'TRAINING',
  AWAITING_CONSENT = 'AWAITING_CONSENT',
  READY = 'READY',
  FAILED = 'FAILED',
  CONSENT_REJECTED = 'CONSENT_REJECTED',
}

/** What the digital twin panel offers on a twin (#9744). */
export enum AvatarTwinPanelAction {
  OPEN_CONSENT = 'open_consent',
  APPLY_TO_BRAND = 'apply_to_brand',
  RETAKE = 'retake',
  REMOVE = 'remove',
}

/**
 * The panel actions each twin status allows. Remove is always offered; a
 * new take only after training failed or consent was declined.
 */
export const AVATAR_TWIN_PANEL_ACTIONS: Readonly<
  Record<AvatarTwinStatus, readonly AvatarTwinPanelAction[]>
> = {
  [AvatarTwinStatus.UPLOADING]: [AvatarTwinPanelAction.REMOVE],
  [AvatarTwinStatus.TRAINING]: [AvatarTwinPanelAction.REMOVE],
  [AvatarTwinStatus.AWAITING_CONSENT]: [
    AvatarTwinPanelAction.OPEN_CONSENT,
    AvatarTwinPanelAction.REMOVE,
  ],
  [AvatarTwinStatus.READY]: [
    AvatarTwinPanelAction.APPLY_TO_BRAND,
    AvatarTwinPanelAction.REMOVE,
  ],
  [AvatarTwinStatus.FAILED]: [
    AvatarTwinPanelAction.RETAKE,
    AvatarTwinPanelAction.REMOVE,
  ],
  [AvatarTwinStatus.CONSENT_REJECTED]: [
    AvatarTwinPanelAction.OPEN_CONSENT,
    AvatarTwinPanelAction.RETAKE,
    AvatarTwinPanelAction.REMOVE,
  ],
};

export function canUseAvatarTwinPanelAction(
  status: AvatarTwinStatus,
  action: AvatarTwinPanelAction,
): boolean {
  return AVATAR_TWIN_PANEL_ACTIONS[status].includes(action);
}

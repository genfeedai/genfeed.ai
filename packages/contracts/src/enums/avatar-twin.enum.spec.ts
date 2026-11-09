import { describe, expect, it } from 'vitest';
import {
  AVATAR_TWIN_PANEL_ACTIONS,
  AvatarTwinPanelAction,
  AvatarTwinStatus,
  canUseAvatarTwinPanelAction,
} from './avatar-twin.enum';

describe('AVATAR_TWIN_PANEL_ACTIONS', () => {
  it.each([
    [AvatarTwinStatus.UPLOADING, [AvatarTwinPanelAction.REMOVE]],
    [AvatarTwinStatus.TRAINING, [AvatarTwinPanelAction.REMOVE]],
    [
      AvatarTwinStatus.AWAITING_CONSENT,
      [AvatarTwinPanelAction.OPEN_CONSENT, AvatarTwinPanelAction.REMOVE],
    ],
    [
      AvatarTwinStatus.READY,
      [AvatarTwinPanelAction.APPLY_TO_BRAND, AvatarTwinPanelAction.REMOVE],
    ],
    [
      AvatarTwinStatus.FAILED,
      [AvatarTwinPanelAction.RETAKE, AvatarTwinPanelAction.REMOVE],
    ],
    [
      AvatarTwinStatus.CONSENT_REJECTED,
      [
        AvatarTwinPanelAction.OPEN_CONSENT,
        AvatarTwinPanelAction.RETAKE,
        AvatarTwinPanelAction.REMOVE,
      ],
    ],
  ])('%s offers %j', (status, expected) => {
    expect(AVATAR_TWIN_PANEL_ACTIONS[status]).toEqual(expected);
  });

  it.each([
    [AvatarTwinStatus.READY, AvatarTwinPanelAction.OPEN_CONSENT, false],
    [AvatarTwinStatus.TRAINING, AvatarTwinPanelAction.APPLY_TO_BRAND, false],
    [AvatarTwinStatus.CONSENT_REJECTED, AvatarTwinPanelAction.RETAKE, true],
  ])('%s allows %s: %s', (status, action, expected) => {
    expect(canUseAvatarTwinPanelAction(status, action)).toBe(expected);
  });
});

/**
 * #4670 Agent -> Studio handoff: projects the Agent-resolved payload onto
 * Studio's own shapes. Kept separate from `studio-generation-setup-bridge.ts`
 * (which bridges Studio's *own* settings to the shared Unified Generation
 * Setup store) because a handoff carries composer-only fields
 * (`prompt`, `references`) that never lived in either settings shape.
 */
import type { AgentStudioHandoffPayload } from '@genfeedai/contracts/interfaces';
import type { StudioGenerateReferenceRole } from '@genfeedai/props/studio/studio-generate.props';
import type { StudioGenerateSettings } from '@pages/studio/generate/types';

/**
 * Every field the handoff carries maps 1:1 onto a `StudioGenerateSettings`
 * key already used for hand-picked settings (`applyTypeSettings`), so the
 * shared store's `setField` marks each one `'user'`-owned — the prefill wins
 * over whatever was remembered for this type, exactly like an operator
 * editing the popover themselves would.
 *
 * `modelKey` is always included: the Agent never hands off the literal
 * `"auto"`, so there is no sentinel-value case to special-case here (see
 * `toStudioSettingsModelKey`).
 */
export function buildStudioSettingsPatchFromHandoff(
  payload: AgentStudioHandoffPayload,
): Partial<StudioGenerateSettings> {
  const patch: Partial<StudioGenerateSettings> = {
    modelKey: payload.modelKey,
  };

  if (payload.aspectRatio) {
    patch.aspectRatio = payload.aspectRatio;
  }
  if (payload.duration !== undefined) {
    patch.duration = payload.duration;
  }
  if (payload.outputs !== undefined) {
    patch.outputs = payload.outputs;
  }
  if (payload.resolution) {
    patch.resolution = payload.resolution;
  }
  if (payload.avatarPhotoUrl) {
    patch.avatarPhotoUrl = payload.avatarPhotoUrl;
  }
  if (payload.voiceId) {
    patch.voiceId = payload.voiceId;
  }

  return patch;
}

/**
 * A video handoff's single reference id is the clip's start frame (mirrors
 * `useGenerationActionCard`'s `startFrameId` convention on the Agent side);
 * every other type attaches its references as plain generation references.
 */
export function studioHandoffReferenceRole(
  type: AgentStudioHandoffPayload['type'],
): StudioGenerateReferenceRole {
  return type === 'video' ? 'startFrame' : 'reference';
}

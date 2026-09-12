/**
 * #4670 Agent -> Studio handoff: projects the Agent-resolved payload onto
 * Studio's own shapes. Kept separate from `studio-generation-setup-bridge.ts`
 * (which bridges Studio's *own* settings to the shared Unified Generation
 * Setup store) because a handoff carries composer-only fields
 * (`prompt`, `references`) that never lived in either settings shape.
 */
import type {
  AgentStudioHandoffPayload,
  IModel,
} from '@genfeedai/contracts/interfaces';
import type { StudioGenerateReferenceRole } from '@genfeedai/props/studio/studio-generate.props';
import type { StudioGenerateSettings } from '@pages/studio/generate/types';
import {
  getDefaultStudioGenerateSettings,
  getStudioAspectRatios,
  getStudioDurations,
  getStudioResolutions,
  STUDIO_MAX_OUTPUTS,
} from '@pages/studio/generate/utils/studio-generate-settings';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';

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

export interface ResolvedHandoffModelKey {
  /** `true` when the requested key was rejected and Auto was substituted. */
  isFallback: boolean;
  modelKey: string;
}

/**
 * Validates the handoff's resolved model against the org's currently allowed
 * catalog for the type (#4716 review P1). The Agent resolves a concrete
 * model at handoff time, but the org's enabled-model allowlist can change (or
 * differ from what the Agent's own catalog fetch saw) by the time Studio
 * opens — landing a disallowed key in settings would otherwise repeat the
 * silent `models[0]` substitution `resolveModelKey` already does at submit
 * time (`useStudioGeneration.ts`), just one step earlier and with no notice
 * either. An empty `models` list never counts as "nothing is allowed" — it
 * means either a type with no router catalog (avatar/voice) or an
 * in-flight/failed catalog fetch, neither of which should blank a
 * possibly-valid key.
 */
export function resolveHandoffModelKey(
  modelKey: string,
  models: readonly Pick<IModel, 'key'>[],
): ResolvedHandoffModelKey {
  if (!modelKey || models.length === 0) {
    return { isFallback: false, modelKey };
  }
  if (models.some((model) => model.key === modelKey)) {
    return { isFallback: false, modelKey };
  }
  return { isFallback: true, modelKey: AUTO_MODEL_OPTION_VALUE };
}

export interface ResolvedHandoffSettingsOverrides {
  /** Human-readable labels of every field that was dropped, for one combined notice. Empty when nothing was dropped. */
  droppedFields: readonly string[];
  /** Patch correcting each dropped field back to Studio's own type default — apply on top of the handoff patch already applied. */
  patch: Partial<StudioGenerateSettings>;
}

/**
 * Validates the handoff's aspectRatio/duration/outputs/resolution against
 * what the type and resolved model actually support (#4716 review FR9).
 * `buildStudioSettingsPatchFromHandoff` copies these fields verbatim — the
 * Agent's own catalog can drift from Studio's by the time the handoff is
 * consumed, or the model itself may have been replaced by
 * `resolveHandoffModelKey`. Run this once the model is settled, using the
 * concrete resolved model (not the handoff's original, possibly-invalidated
 * pick) so resolution options — the only genuinely model-specific field
 * here — are checked against what the operator will actually see.
 */
export function resolveHandoffSettingsOverrides(
  payload: AgentStudioHandoffPayload,
  resolvedModelKey: string,
  models: readonly IModel[],
): ResolvedHandoffSettingsOverrides {
  const defaults = getDefaultStudioGenerateSettings(payload.type);
  const patch: Partial<StudioGenerateSettings> = {};
  const droppedFields: string[] = [];

  if (payload.aspectRatio) {
    const allowed = getStudioAspectRatios(payload.type);
    if (!allowed.includes(payload.aspectRatio)) {
      patch.aspectRatio = defaults.aspectRatio;
      droppedFields.push('aspect ratio');
    }
  }

  if (payload.duration !== undefined) {
    const allowed = getStudioDurations(payload.type);
    if (allowed.length > 0 && !allowed.includes(payload.duration)) {
      patch.duration = defaults.duration;
      droppedFields.push('duration');
    }
  }

  if (payload.resolution) {
    const allowed = getStudioResolutions(
      payload.type,
      resolvedModelKey || undefined,
    );
    if (
      allowed.length > 0 &&
      !allowed.some((option) => option.value === payload.resolution)
    ) {
      patch.resolution = defaults.resolution;
      droppedFields.push('resolution');
    }
  }

  if (payload.outputs !== undefined) {
    const selectedModel = models.find(
      (model) => model.key === resolvedModelKey,
    );
    const maxOutputs =
      typeof selectedModel?.maxOutputs === 'number' &&
      Number.isFinite(selectedModel.maxOutputs) &&
      selectedModel.maxOutputs >= 1
        ? Math.min(STUDIO_MAX_OUTPUTS, Math.round(selectedModel.maxOutputs))
        : STUDIO_MAX_OUTPUTS;
    if (payload.outputs > maxOutputs) {
      patch.outputs = maxOutputs;
      droppedFields.push('output count');
    }
  }

  return { droppedFields, patch };
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

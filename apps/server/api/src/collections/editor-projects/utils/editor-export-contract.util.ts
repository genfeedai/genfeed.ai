import {
  EditorEffectType,
  EditorTrackType,
  EditorTransitionType,
  IngredientFormat,
} from '@genfeedai/enums';
import {
  EDITOR_EXPORT_CONTRACT_VERSION,
  type IEditorClip,
  type IEditorEffect,
  type IEditorExportAssetReference,
  type IEditorExportCompositionSnapshot,
  type IEditorProjectSettings,
  type IEditorTextOverlay,
  type IEditorTrack,
  type IEditorTransition,
  type IValidatedEditorExportContract,
} from '@genfeedai/interfaces';

interface EditorExportProjectInput {
  id?: unknown;
  settings?: unknown;
  totalDurationFrames?: unknown;
  tracks?: unknown;
}

export interface EditorExportContractViolation {
  code: string;
  message: string;
  path: string;
}

export class EditorExportContractValidationError extends Error {
  readonly violations: EditorExportContractViolation[];

  constructor(violations: EditorExportContractViolation[]) {
    super(violations[0]?.message ?? 'Editor export contract is invalid.');
    this.name = 'EditorExportContractValidationError';
    this.violations = violations;
  }
}

const editorEffectTypes = new Set<string>(Object.values(EditorEffectType));
const editorTrackTypes = new Set<string>(Object.values(EditorTrackType));
const editorTransitionTypes = new Set<string>(
  Object.values(EditorTransitionType),
);
const ingredientFormats = new Set<string>(Object.values(IngredientFormat));

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isPercentage(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 100;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function addViolation(
  violations: EditorExportContractViolation[],
  path: string,
  code: string,
  message: string,
): void {
  violations.push({ code, message, path });
}

function readSettings(
  value: unknown,
  violations: EditorExportContractViolation[],
): IEditorProjectSettings | null {
  if (!isRecord(value)) {
    addViolation(
      violations,
      'settings',
      'editor_export_settings_required',
      'Editor export settings are required.',
    );
    return null;
  }

  if (!ingredientFormats.has(String(value.format))) {
    addViolation(
      violations,
      'settings.format',
      'editor_export_format_invalid',
      'Editor export format must be landscape, portrait, or square.',
    );
  }
  if (!isPositiveInteger(value.width)) {
    addViolation(
      violations,
      'settings.width',
      'editor_export_width_invalid',
      'Editor export width must be a positive integer.',
    );
  }
  if (!isPositiveInteger(value.height)) {
    addViolation(
      violations,
      'settings.height',
      'editor_export_height_invalid',
      'Editor export height must be a positive integer.',
    );
  }
  if (!isPositiveInteger(value.fps) || value.fps > 120) {
    addViolation(
      violations,
      'settings.fps',
      'editor_export_fps_invalid',
      'Editor export frame rate must be an integer between 1 and 120.',
    );
  }
  if (!isNonEmptyString(value.backgroundColor)) {
    addViolation(
      violations,
      'settings.backgroundColor',
      'editor_export_background_invalid',
      'Editor export background color is required.',
    );
  }

  if (
    !ingredientFormats.has(String(value.format)) ||
    !isPositiveInteger(value.width) ||
    !isPositiveInteger(value.height) ||
    !isPositiveInteger(value.fps) ||
    value.fps > 120 ||
    !isNonEmptyString(value.backgroundColor)
  ) {
    return null;
  }

  return {
    backgroundColor: value.backgroundColor,
    format: value.format as IngredientFormat,
    fps: value.fps,
    height: value.height,
    width: value.width,
  };
}

function readEffect(
  value: unknown,
  path: string,
  violations: EditorExportContractViolation[],
): IEditorEffect | null {
  if (!isRecord(value) || !editorEffectTypes.has(String(value.type))) {
    addViolation(
      violations,
      `${path}.type`,
      'editor_export_effect_invalid',
      'Editor export effects must use a supported effect type.',
    );
    return null;
  }
  if (!isPercentage(value.intensity)) {
    addViolation(
      violations,
      `${path}.intensity`,
      'editor_export_effect_intensity_invalid',
      'Editor export effect intensity must be between 0 and 100.',
    );
    return null;
  }

  return {
    intensity: value.intensity,
    type: value.type as EditorEffectType,
  };
}

function readTransition(
  value: unknown,
  path: string,
  clipDuration: number,
  violations: EditorExportContractViolation[],
): IEditorTransition | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value) || !editorTransitionTypes.has(String(value.type))) {
    addViolation(
      violations,
      `${path}.type`,
      'editor_export_transition_invalid',
      'Editor export transitions must use a supported transition type.',
    );
    return undefined;
  }
  if (!isNonNegativeInteger(value.duration) || value.duration > clipDuration) {
    addViolation(
      violations,
      `${path}.duration`,
      'editor_export_transition_duration_invalid',
      'Editor export transition duration must fit within its clip.',
    );
    return undefined;
  }

  return {
    duration: value.duration,
    type: value.type as EditorTransitionType,
  };
}

function readTextOverlay(
  value: unknown,
  path: string,
  violations: EditorExportContractViolation[],
): IEditorTextOverlay | null {
  if (!isRecord(value)) {
    addViolation(
      violations,
      path,
      'editor_export_text_overlay_required',
      'Text clips require a text overlay.',
    );
    return null;
  }

  if (!isNonEmptyString(value.text)) {
    addViolation(
      violations,
      `${path}.text`,
      'editor_export_text_required',
      'Text overlay content is required.',
    );
  }
  if (!isRecord(value.position)) {
    addViolation(
      violations,
      `${path}.position`,
      'editor_export_text_position_invalid',
      'Text overlay position must contain percentage-based x and y values.',
    );
  } else {
    if (!isPercentage(value.position.x)) {
      addViolation(
        violations,
        `${path}.position.x`,
        'editor_export_text_position_x_invalid',
        'Text overlay x position must be between 0 and 100.',
      );
    }
    if (!isPercentage(value.position.y)) {
      addViolation(
        violations,
        `${path}.position.y`,
        'editor_export_text_position_y_invalid',
        'Text overlay y position must be between 0 and 100.',
      );
    }
  }
  if (!isFiniteNumber(value.fontSize) || value.fontSize <= 0) {
    addViolation(
      violations,
      `${path}.fontSize`,
      'editor_export_text_size_invalid',
      'Text overlay font size must be greater than zero.',
    );
  }
  if (!isNonEmptyString(value.color)) {
    addViolation(
      violations,
      `${path}.color`,
      'editor_export_text_color_invalid',
      'Text overlay color is required.',
    );
  }
  if (
    value.fontWeight !== undefined &&
    (!isFiniteNumber(value.fontWeight) || value.fontWeight <= 0)
  ) {
    addViolation(
      violations,
      `${path}.fontWeight`,
      'editor_export_text_weight_invalid',
      'Text overlay font weight must be greater than zero.',
    );
  }
  if (
    value.padding !== undefined &&
    (!isFiniteNumber(value.padding) || value.padding < 0)
  ) {
    addViolation(
      violations,
      `${path}.padding`,
      'editor_export_text_padding_invalid',
      'Text overlay padding cannot be negative.',
    );
  }

  if (
    !isNonEmptyString(value.text) ||
    !isRecord(value.position) ||
    !isPercentage(value.position.x) ||
    !isPercentage(value.position.y) ||
    !isFiniteNumber(value.fontSize) ||
    value.fontSize <= 0 ||
    !isNonEmptyString(value.color)
  ) {
    return null;
  }

  return {
    backgroundColor:
      typeof value.backgroundColor === 'string'
        ? value.backgroundColor
        : undefined,
    color: value.color,
    fontFamily:
      typeof value.fontFamily === 'string' ? value.fontFamily : undefined,
    fontSize: value.fontSize,
    fontWeight:
      isFiniteNumber(value.fontWeight) && value.fontWeight > 0
        ? value.fontWeight
        : undefined,
    padding:
      isFiniteNumber(value.padding) && value.padding >= 0
        ? value.padding
        : undefined,
    position: {
      x: value.position.x,
      y: value.position.y,
    },
    text: value.text,
  };
}

function readClip(
  value: unknown,
  path: string,
  trackType: EditorTrackType,
  totalDurationFrames: number,
  violations: EditorExportContractViolation[],
): IEditorClip | null {
  if (!isRecord(value)) {
    addViolation(
      violations,
      path,
      'editor_export_clip_invalid',
      'Editor export clips must be objects.',
    );
    return null;
  }

  if (!isNonEmptyString(value.id)) {
    addViolation(
      violations,
      `${path}.id`,
      'editor_export_clip_id_required',
      'Editor export clip id is required.',
    );
  }
  if (!isNonNegativeInteger(value.startFrame)) {
    addViolation(
      violations,
      `${path}.startFrame`,
      'editor_export_clip_start_invalid',
      'Editor export clip start frame must be a non-negative integer.',
    );
  }
  if (!isPositiveInteger(value.durationFrames)) {
    addViolation(
      violations,
      `${path}.durationFrames`,
      'editor_export_clip_duration_invalid',
      'Editor export clip duration must be a positive integer.',
    );
  }
  if (
    isNonNegativeInteger(value.startFrame) &&
    isPositiveInteger(value.durationFrames) &&
    value.startFrame + value.durationFrames > totalDurationFrames
  ) {
    addViolation(
      violations,
      `${path}.durationFrames`,
      'editor_export_clip_out_of_bounds',
      'Editor export clip must fit within the project duration.',
    );
  }
  if (!isNonNegativeInteger(value.sourceStartFrame)) {
    addViolation(
      violations,
      `${path}.sourceStartFrame`,
      'editor_export_source_start_invalid',
      'Editor export source start frame must be a non-negative integer.',
    );
  }
  if (
    !isPositiveInteger(value.sourceEndFrame) ||
    (isNonNegativeInteger(value.sourceStartFrame) &&
      value.sourceEndFrame <= value.sourceStartFrame)
  ) {
    addViolation(
      violations,
      `${path}.sourceEndFrame`,
      'editor_export_source_end_invalid',
      'Editor export source end frame must be after its source start frame.',
    );
  }
  if (value.volume !== undefined && !isPercentage(value.volume)) {
    addViolation(
      violations,
      `${path}.volume`,
      'editor_export_clip_volume_invalid',
      'Editor export clip volume must be between 0 and 100.',
    );
  }

  const effects = Array.isArray(value.effects)
    ? value.effects
        .map((effect, index) =>
          readEffect(effect, `${path}.effects[${index}]`, violations),
        )
        .filter((effect): effect is IEditorEffect => effect !== null)
    : [];
  if (!Array.isArray(value.effects)) {
    addViolation(
      violations,
      `${path}.effects`,
      'editor_export_effects_invalid',
      'Editor export clip effects must be an array.',
    );
  }

  const clipDuration = isPositiveInteger(value.durationFrames)
    ? value.durationFrames
    : 0;
  const transitionIn = readTransition(
    value.transitionIn,
    `${path}.transitionIn`,
    clipDuration,
    violations,
  );
  const transitionOut = readTransition(
    value.transitionOut,
    `${path}.transitionOut`,
    clipDuration,
    violations,
  );
  const textOverlay =
    trackType === EditorTrackType.TEXT
      ? readTextOverlay(value.textOverlay, `${path}.textOverlay`, violations)
      : undefined;

  if (trackType !== EditorTrackType.TEXT) {
    if (!isNonEmptyString(value.ingredientId)) {
      addViolation(
        violations,
        `${path}.ingredientId`,
        'editor_export_asset_id_required',
        'Video and audio clips require an ingredient id.',
      );
    }
    if (!isNonEmptyString(value.ingredientUrl)) {
      addViolation(
        violations,
        `${path}.ingredientUrl`,
        'editor_export_asset_url_required',
        'Video and audio clips require an ingredient URL.',
      );
    }
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonNegativeInteger(value.startFrame) ||
    !isPositiveInteger(value.durationFrames) ||
    value.startFrame + value.durationFrames > totalDurationFrames ||
    !isNonNegativeInteger(value.sourceStartFrame) ||
    !isPositiveInteger(value.sourceEndFrame) ||
    value.sourceEndFrame <= value.sourceStartFrame ||
    !Array.isArray(value.effects) ||
    (trackType === EditorTrackType.TEXT && !textOverlay) ||
    (trackType !== EditorTrackType.TEXT &&
      (!isNonEmptyString(value.ingredientId) ||
        !isNonEmptyString(value.ingredientUrl)))
  ) {
    return null;
  }

  return {
    durationFrames: value.durationFrames,
    effects,
    id: value.id,
    ingredientId:
      typeof value.ingredientId === 'string' ? value.ingredientId : '',
    ingredientUrl:
      typeof value.ingredientUrl === 'string' ? value.ingredientUrl : '',
    sourceEndFrame: value.sourceEndFrame,
    sourceStartFrame: value.sourceStartFrame,
    startFrame: value.startFrame,
    textOverlay: textOverlay ?? undefined,
    thumbnailUrl:
      typeof value.thumbnailUrl === 'string' ? value.thumbnailUrl : undefined,
    transitionIn,
    transitionOut,
    volume: isFiniteNumber(value.volume) ? value.volume : undefined,
  };
}

function readTrack(
  value: unknown,
  index: number,
  totalDurationFrames: number,
  violations: EditorExportContractViolation[],
): IEditorTrack | null {
  const path = `tracks[${index}]`;
  if (!isRecord(value)) {
    addViolation(
      violations,
      path,
      'editor_export_track_invalid',
      'Editor export tracks must be objects.',
    );
    return null;
  }

  if (!isNonEmptyString(value.id)) {
    addViolation(
      violations,
      `${path}.id`,
      'editor_export_track_id_required',
      'Editor export track id is required.',
    );
  }
  if (!editorTrackTypes.has(String(value.type))) {
    addViolation(
      violations,
      `${path}.type`,
      'editor_export_track_type_invalid',
      'Editor export track type must be video, audio, or text.',
    );
  }
  if (!isNonEmptyString(value.name)) {
    addViolation(
      violations,
      `${path}.name`,
      'editor_export_track_name_required',
      'Editor export track name is required.',
    );
  }
  if (typeof value.isMuted !== 'boolean') {
    addViolation(
      violations,
      `${path}.isMuted`,
      'editor_export_track_muted_invalid',
      'Editor export track mute state must be boolean.',
    );
  }
  if (typeof value.isLocked !== 'boolean') {
    addViolation(
      violations,
      `${path}.isLocked`,
      'editor_export_track_locked_invalid',
      'Editor export track lock state must be boolean.',
    );
  }
  if (!isPercentage(value.volume)) {
    addViolation(
      violations,
      `${path}.volume`,
      'editor_export_track_volume_invalid',
      'Editor export track volume must be between 0 and 100.',
    );
  }
  if (!Array.isArray(value.clips)) {
    addViolation(
      violations,
      `${path}.clips`,
      'editor_export_clips_invalid',
      'Editor export track clips must be an array.',
    );
  }

  if (
    !isNonEmptyString(value.id) ||
    !editorTrackTypes.has(String(value.type)) ||
    !isNonEmptyString(value.name) ||
    typeof value.isMuted !== 'boolean' ||
    typeof value.isLocked !== 'boolean' ||
    !isPercentage(value.volume) ||
    !Array.isArray(value.clips)
  ) {
    return null;
  }

  const trackType = value.type as EditorTrackType;
  const clips = value.clips
    .map((clip, clipIndex) =>
      readClip(
        clip,
        `${path}.clips[${clipIndex}]`,
        trackType,
        totalDurationFrames,
        violations,
      ),
    )
    .filter((clip): clip is IEditorClip => clip !== null);

  return {
    clips,
    id: value.id,
    isLocked: value.isLocked,
    isMuted: value.isMuted,
    name: value.name,
    type: trackType,
    volume: value.volume,
  };
}

function addDuplicateIdViolations(
  tracks: IEditorTrack[],
  violations: EditorExportContractViolation[],
): void {
  const trackIds = new Set<string>();
  const clipIds = new Set<string>();

  tracks.forEach((track, trackIndex) => {
    if (trackIds.has(track.id)) {
      addViolation(
        violations,
        `tracks[${trackIndex}].id`,
        'editor_export_track_id_duplicate',
        `Editor export track id "${track.id}" is duplicated.`,
      );
    }
    trackIds.add(track.id);

    track.clips.forEach((clip, clipIndex) => {
      if (clipIds.has(clip.id)) {
        addViolation(
          violations,
          `tracks[${trackIndex}].clips[${clipIndex}].id`,
          'editor_export_clip_id_duplicate',
          `Editor export clip id "${clip.id}" is duplicated.`,
        );
      }
      clipIds.add(clip.id);
    });
  });
}

function buildAssetManifest(
  tracks: IEditorTrack[],
): IEditorExportAssetReference[] {
  return tracks.flatMap((track) => {
    if (track.type === EditorTrackType.TEXT) {
      return [];
    }

    return track.clips.map((clip) => ({
      clipId: clip.id,
      ingredientId: clip.ingredientId,
      ingredientUrl: clip.ingredientUrl,
      trackId: track.id,
      type: track.type,
    }));
  });
}

export function buildValidatedEditorExportContract(
  project: EditorExportProjectInput,
): IValidatedEditorExportContract {
  const violations: EditorExportContractViolation[] = [];

  if (!isNonEmptyString(project.id)) {
    addViolation(
      violations,
      'id',
      'editor_export_project_id_required',
      'Editor export project id is required.',
    );
  }
  if (!isPositiveInteger(project.totalDurationFrames)) {
    addViolation(
      violations,
      'totalDurationFrames',
      'editor_export_duration_invalid',
      'Editor export duration must be a positive integer.',
    );
  }
  if (!Array.isArray(project.tracks) || project.tracks.length === 0) {
    addViolation(
      violations,
      'tracks',
      'editor_export_tracks_required',
      'Editor export requires at least one track.',
    );
  }

  const settings = readSettings(project.settings, violations);
  const totalDurationFrames = isPositiveInteger(project.totalDurationFrames)
    ? project.totalDurationFrames
    : 0;
  const tracks = Array.isArray(project.tracks)
    ? project.tracks
        .map((track, index) =>
          readTrack(track, index, totalDurationFrames, violations),
        )
        .filter((track): track is IEditorTrack => track !== null)
    : [];

  addDuplicateIdViolations(tracks, violations);

  const hasVideoClip = tracks.some(
    (track) => track.type === EditorTrackType.VIDEO && track.clips.length > 0,
  );
  if (!hasVideoClip) {
    addViolation(
      violations,
      'tracks',
      'editor_export_video_required',
      'Editor export requires at least one video clip.',
    );
  }

  if (
    violations.length > 0 ||
    !settings ||
    !isNonEmptyString(project.id) ||
    totalDurationFrames === 0
  ) {
    throw new EditorExportContractValidationError(violations);
  }

  const snapshot: IEditorExportCompositionSnapshot = {
    projectId: project.id,
    settings,
    totalDurationFrames,
    tracks,
    version: EDITOR_EXPORT_CONTRACT_VERSION,
  };

  return {
    assetManifest: buildAssetManifest(tracks),
    snapshot,
  };
}

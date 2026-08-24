import { type CinematicPreset, getAllPresets } from './cinematic-presets';
import {
  UGC_CAMERA_MODE_COPY,
  UGC_CAMERA_MODES,
  type UgcCameraMode,
} from './ugc-camera-modes';

export { UGC_CAMERA_MODES, type UgcCameraMode };

export const UGC_PROMPT_BLOCK_KINDS = [
  'micro-expression',
  'camera-imperfection',
  'identity-lock',
  'framing-anchor',
] as const;

export type UgcPromptBlockKind = (typeof UGC_PROMPT_BLOCK_KINDS)[number];

export type UgcPromptBlocks = {
  cameraImperfection: string;
  framingAnchor: string;
  identityLock: string;
  microExpression: string;
};

export type UgcVocabularyEntry = {
  kind: UgcPromptBlockKind;
  label: string;
  text: string;
};

export const UGC_VOCABULARY_LABELS: Record<UgcPromptBlockKind, string> = {
  'camera-imperfection': 'Camera',
  'framing-anchor': 'Framing anchors',
  'identity-lock': 'Identity lock',
  'micro-expression': 'Micro-expression & presenter pacing',
};

const UGC_VOCABULARY_ORDER: UgcPromptBlockKind[] = [
  'identity-lock',
  'framing-anchor',
  'micro-expression',
  'camera-imperfection',
];

export type UgcPreset = {
  blocks: UgcPromptBlocks;
  cameraMode: UgcCameraMode;
  description: string;
  id: string;
  name: string;
};

export type VideoPromptPreset = CinematicPreset | UgcPreset;

export type ComposeUgcPromptBlocksInput = {
  hasStartFrameReference: boolean;
  preset: UgcPreset;
};

export type CompileUgcPromptInput = {
  action: string;
  colorPalette: string;
  hasStartFrameReference: boolean;
  lighting: string;
  mood: string;
  presetId: string;
  subject: string;
};

export const UGC_PRESET_IDS = [
  'ugc_selfie_handheld',
  'ugc_tripod_vlog',
  'ugc_filmed_by_another',
] as const;

export type UgcPresetId = (typeof UGC_PRESET_IDS)[number];

const MICRO_EXPRESSION_BLOCK =
  'Natural talking-head pacing: a small eyebrow raise on key clauses, controlled pauses between thoughts, and brief facial stillness after each phrase. Tie exactly one physically plausible gesture to one phrase so the movement ends before a quiet tail hold. End the clip with a settled face and a closed, resting mouth. Keep hands below the collarbone, away from the face and lens, or out of frame. Restrained realism: natural skin, hair, eye moisture, fabric, breathing, sparse bilateral blinking, and restrained head motion.';

const IDENTITY_LOCK_BLOCK =
  'Identity lock: do not alter facial proportions, eye shape, or hairstyle; keep natural skin texture. Exclude drift in identity, face, glasses, hair, wardrobe, skin tone, background, camera, lighting, fingers, hands, dialogue, text, logo, watermark, or extra people.';

const IDENTITY_LOCK_WITH_REFERENCE_BLOCK = `Use the start-frame reference image as the sole presenter and scene reference. ${IDENTITY_LOCK_BLOCK}`;

const FRAMING_REFERENCE_PREFIX =
  'Keep consistent framing with the start-frame reference image. ';

function buildUgcPreset(cameraMode: UgcCameraMode): UgcPreset {
  const copy = UGC_CAMERA_MODE_COPY[cameraMode];
  return {
    blocks: {
      cameraImperfection: copy.cameraImperfection,
      framingAnchor: copy.framingAnchor,
      identityLock: IDENTITY_LOCK_BLOCK,
      microExpression: MICRO_EXPRESSION_BLOCK,
    },
    cameraMode,
    description: copy.description,
    id: copy.id,
    name: copy.name,
  };
}

export const UGC_PRESETS: Record<UgcPresetId, UgcPreset> = {
  ugc_filmed_by_another: buildUgcPreset('filmed-by-another-person'),
  ugc_selfie_handheld: buildUgcPreset('selfie-handheld'),
  ugc_tripod_vlog: buildUgcPreset('tripod-vlog'),
};

export const isUgcPresetId = (id: string): id is UgcPresetId => {
  return Object.hasOwn(UGC_PRESETS, id);
};

export const getUgcPresetById = (id: string): UgcPreset | null => {
  if (!isUgcPresetId(id)) {
    return null;
  }
  return UGC_PRESETS[id];
};

export const getAllUgcPresets = (): UgcPreset[] => {
  return UGC_PRESET_IDS.map((id) => UGC_PRESETS[id]);
};

export const getAllVideoPresets = (): VideoPromptPreset[] => {
  return [...getAllPresets(), ...getAllUgcPresets()];
};

export const isUgcPreset = (preset: VideoPromptPreset): preset is UgcPreset => {
  return 'cameraMode' in preset && 'blocks' in preset;
};

export const isCinematicPreset = (
  preset: VideoPromptPreset,
): preset is CinematicPreset => {
  return 'cameraPrompt' in preset && 'colorGrade' in preset;
};

export const composeUgcPromptBlocks = (
  input: ComposeUgcPromptBlocksInput,
): UgcPromptBlocks => {
  const identityLock = input.hasStartFrameReference
    ? IDENTITY_LOCK_WITH_REFERENCE_BLOCK
    : input.preset.blocks.identityLock;

  const framingAnchor = input.hasStartFrameReference
    ? `${FRAMING_REFERENCE_PREFIX}${input.preset.blocks.framingAnchor}`
    : input.preset.blocks.framingAnchor;

  return {
    cameraImperfection: input.preset.blocks.cameraImperfection,
    framingAnchor,
    identityLock,
    microExpression: input.preset.blocks.microExpression,
  };
};

export const compileUgcPrompt = (input: CompileUgcPromptInput): string => {
  const preset = getUgcPresetById(input.presetId);
  if (!preset) {
    throw new Error(`UGC preset not found: ${input.presetId}`);
  }

  const blocks = composeUgcPromptBlocks({
    hasStartFrameReference: input.hasStartFrameReference,
    preset,
  });

  const actionPart = input.action.trim();
  const subjectPart = input.subject.trim();
  const tonePart = `${input.lighting.trim()}, ${input.colorPalette.trim()}, ${input.mood.trim()}.`;

  return [
    blocks.identityLock,
    blocks.framingAnchor,
    `${actionPart}.`,
    `${subjectPart}.`,
    blocks.microExpression,
    blocks.cameraImperfection,
    tonePart,
  ].join(' ');
};

export const getUgcVocabularyLibrary = (
  input: ComposeUgcPromptBlocksInput,
): UgcVocabularyEntry[] => {
  const blocks = composeUgcPromptBlocks(input);
  const texts: Record<UgcPromptBlockKind, string> = {
    'camera-imperfection': blocks.cameraImperfection,
    'framing-anchor': blocks.framingAnchor,
    'identity-lock': blocks.identityLock,
    'micro-expression': blocks.microExpression,
  };

  return UGC_VOCABULARY_ORDER.map((kind) => ({
    kind,
    label: UGC_VOCABULARY_LABELS[kind],
    text: texts[kind],
  }));
};

import { getPresetById } from '../presets/cinematic-presets';
import type { UgcPreset, VideoPromptPreset } from '../presets/ugc-presets';
import {
  compileUgcPrompt,
  getUgcPresetById,
  isCinematicPreset,
} from '../presets/ugc-presets';

export type CameraMovement =
  | 'dolly'
  | 'tracking'
  | 'static'
  | 'crane'
  | 'aerial'
  | 'handheld'
  | 'steadicam';

export interface CASTInput {
  presetId: string;
  cameraMovement?: CameraMovement;
  action: string; // "a woman walking through rain"
  subject: string; // "young woman in a red coat, wet streets reflecting neon"
  lighting: string; // "moody neon lighting with rain reflections"
  colorPalette: string; // "teal and orange, warm highlights"
  mood: string; // "melancholic, introspective"
  hasStartFrameReference?: boolean;
}

export interface CASTOutput {
  prompt: string; // Full structured prompt (max 150 words for cinematic)
  preset: VideoPromptPreset;
  metadata: {
    wordCount: number;
    cameraMovement: string;
  };
}

const CAMERA_MOVEMENT_DESCRIPTIONS: Record<CameraMovement, string> = {
  aerial: 'aerial drone establishing shot',
  crane: 'sweeping crane movement',
  dolly: 'smooth dolly shot pushing in',
  handheld: 'dynamic handheld camera movement',
  static: 'locked-off static composition',
  steadicam: 'fluid steadicam glide',
  tracking: 'tracking shot following the subject',
};

/**
 * Count words in a string
 */
const countWords = (text: string): number => {
  return text.trim().split(/\s+/).length;
};

/**
 * Truncate text to a maximum word count while preserving sentence structure
 */
const truncateToWordLimit = (text: string, maxWords: number): string => {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) {
    return text;
  }

  // Try to end at a sentence boundary
  const truncated = words.slice(0, maxWords).join(' ');
  const lastPeriod = truncated.lastIndexOf('.');
  const lastComma = truncated.lastIndexOf(',');

  // If we can end at a period, do that
  if (lastPeriod > truncated.length * 0.7) {
    return truncated.slice(0, lastPeriod + 1);
  }

  // Otherwise, if we can end at a comma, do that
  if (lastComma > truncated.length * 0.8) {
    return truncated.slice(0, lastComma);
  }

  // Last resort: just truncate at word boundary
  return truncated;
};

const validateCastSceneFields = (input: CASTInput): void => {
  if (!input.action?.trim()) {
    throw new Error('Action is required');
  }
  if (!input.subject?.trim()) {
    throw new Error('Subject is required');
  }
  if (!input.lighting?.trim()) {
    throw new Error('Lighting is required');
  }
  if (!input.colorPalette?.trim()) {
    throw new Error('Color palette is required');
  }
  if (!input.mood?.trim()) {
    throw new Error('Mood is required');
  }
};

const generateUgcCastPrompt = (
  input: CASTInput,
  preset: UgcPreset,
): CASTOutput => {
  validateCastSceneFields(input);

  const prompt = compileUgcPrompt({
    action: input.action.trim(),
    colorPalette: input.colorPalette.trim(),
    hasStartFrameReference: input.hasStartFrameReference === true,
    lighting: input.lighting.trim(),
    mood: input.mood.trim(),
    presetId: preset.id,
    subject: input.subject.trim(),
  });

  return {
    metadata: {
      cameraMovement: preset.cameraMode,
      wordCount: countWords(prompt),
    },
    preset,
    prompt,
  };
};

/**
 * Generate a CAST-structured prompt for cinematic video generation
 */
export const generateCASTPrompt = (input: CASTInput): CASTOutput => {
  const ugcPreset = getUgcPresetById(input.presetId);
  if (ugcPreset) {
    return generateUgcCastPrompt(input, ugcPreset);
  }

  // Validate preset exists
  const preset = getPresetById(input.presetId);
  if (!preset) {
    throw new Error(`Preset not found: ${input.presetId}`);
  }

  validateCastSceneFields(input);

  if (!input.cameraMovement) {
    throw new Error('Camera movement is required');
  }

  // Build CAST prompt structure
  const cameraMovementDesc = CAMERA_MOVEMENT_DESCRIPTIONS[input.cameraMovement];

  // [Camera] - preset specs + movement
  const cameraPart = `${preset.cameraPrompt}, ${cameraMovementDesc}`;

  // [Action] - primary action
  const actionPart = input.action.trim();

  // [Subject] - detailed subject description
  const subjectPart = input.subject.trim();

  // [Tone] - lighting + color palette + mood
  const tonePart = `${input.lighting}, ${input.colorPalette}, ${input.mood}`;

  // Combine all parts
  const fullPrompt = `${cameraPart}. ${actionPart}. ${subjectPart}. ${tonePart}.`;

  // Enforce 150-word limit
  const finalPrompt = truncateToWordLimit(fullPrompt, 150);
  const wordCount = countWords(finalPrompt);

  return {
    metadata: {
      cameraMovement: input.cameraMovement,
      wordCount,
    },
    preset,
    prompt: finalPrompt,
  };
};

/**
 * Validate CAST input fields
 */
export const validateCASTInput = (
  input: Partial<CASTInput>,
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  const ugcPreset = input.presetId ? getUgcPresetById(input.presetId) : null;

  if (!input.presetId) {
    errors.push('Preset ID is required');
  } else {
    const cinematicPreset = getPresetById(input.presetId);
    if (!cinematicPreset && !ugcPreset) {
      errors.push(`Invalid preset ID: ${input.presetId}`);
    }
  }

  if (!ugcPreset) {
    if (!input.cameraMovement) {
      errors.push('Camera movement is required');
    } else if (!CAMERA_MOVEMENT_DESCRIPTIONS[input.cameraMovement]) {
      errors.push(`Invalid camera movement: ${input.cameraMovement}`);
    }
  }

  if (!input.action?.trim()) {
    errors.push('Action is required');
  }

  if (!input.subject?.trim()) {
    errors.push('Subject is required');
  }

  if (!input.lighting?.trim()) {
    errors.push('Lighting is required');
  }

  if (!input.colorPalette?.trim()) {
    errors.push('Color palette is required');
  }

  if (!input.mood?.trim()) {
    errors.push('Mood is required');
  }

  return {
    errors,
    valid: errors.length === 0,
  };
};

/**
 * Extract post-processing configuration from preset
 */
export const extractPostProcessingConfig = (preset: VideoPromptPreset) => {
  if (!isCinematicPreset(preset)) {
    throw new Error(
      'Post-processing config is only available for cinematic presets',
    );
  }

  return {
    colorGrade: preset.colorGrade,
    filmGrain: preset.filmGrain,
    lensEffects: preset.lensEffects,
  };
};

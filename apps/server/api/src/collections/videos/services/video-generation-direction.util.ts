import type { MediaCreativeDirection } from '@api/services/prompt-enhancement/media-prompt-output.util';

/** The Studio picks that steer a clip, as the request carries them. */
export interface VideoDirectionInput {
  camera?: string;
  cameraMovement?: string;
  duration?: number;
  lens?: string;
  lighting?: string;
  mood?: string;
  scene?: string;
  style?: string;
}

/** Brief fields a compiler appends after the objective, already labeled. */
export interface VideoBriefDirection {
  composition?: string;
  lighting?: string;
  motion?: string;
  scene?: string;
  visualDirection?: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)+$/i;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Studio element keys are slugs (`3d-animated`, `studio`). Sent as-is they read
 * as stray fragments in a prompt, so a slug becomes plain words.
 */
export function humanizeStudioToken(value: string): string {
  const text = SLUG.test(value) ? value.replaceAll('-', ' ') : value;
  return text.replace(/\b3d\b/gi, '3D');
}

function labeled(label: string, ...values: Array<string | undefined>) {
  const parts = values.map(clean).filter((part): part is string => !!part);
  return parts.length > 0
    ? `${label}: ${parts.map(humanizeStudioToken).join(', ')}`
    : undefined;
}

/**
 * One reading of the user's picks, used twice: bound into the enhancer so the
 * prose agrees with them, and appended after the prompt for models that take
 * no structured camera or style fields. Both carry the same words.
 */
export function buildVideoDirection(input: VideoDirectionInput): {
  brief: VideoBriefDirection;
  enhancer: MediaCreativeDirection;
} {
  const scene = labeled('Setting', input.scene);
  const composition = labeled('Camera', input.camera, input.lens);
  const motion = labeled('Camera movement', input.cameraMovement);
  const lighting = labeled('Lighting', input.lighting);
  const style = labeled('Style', input.style);
  const mood = labeled('Mood', input.mood);
  const visualDirection = [style, mood].filter(Boolean).join('. ') || undefined;

  return {
    brief: {
      ...(composition ? { composition } : {}),
      ...(lighting ? { lighting } : {}),
      ...(motion ? { motion } : {}),
      ...(scene ? { scene } : {}),
      ...(visualDirection ? { visualDirection } : {}),
    },
    enhancer: {
      lines: [scene, composition, motion, lighting, style, mood].filter(
        (line): line is string => !!line,
      ),
      ...(input.duration ? { durationSeconds: input.duration } : {}),
    },
  };
}

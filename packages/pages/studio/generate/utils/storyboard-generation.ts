import { IngredientFormat } from '@genfeedai/enums';
import type { IImage, IModel } from '@genfeedai/interfaces';
import type { CameraMovementPreset } from '@genfeedai/interfaces/studio/camera-movement.interface';

export interface StoryboardInterpolationPair {
  startImageId: string;
  endImageId: string;
  prompt?: string;
}

const STORYBOARD_CAMERA_PROMPTS: Record<CameraMovementPreset, string> = {
  'crane-down': 'smooth crane down, descending vertically',
  'crane-up': 'smooth crane up, rising vertically',
  custom: '',
  'dolly-back': 'smooth dolly back, moving away from subject',
  'dolly-forward': 'smooth dolly forward, moving closer to subject',
  'pan-left': 'smooth pan left, following subject',
  'pan-right': 'smooth pan right, following subject',
  'rotate-clockwise': 'smooth rotate clockwise around subject',
  'rotate-counter-clockwise': 'smooth rotate counter-clockwise around subject',
  static: 'static camera, no movement',
  'tilt-down': 'smooth tilt down, revealing scene',
  'tilt-up': 'smooth tilt up, revealing scene',
  'truck-left': 'smooth truck left, maintaining distance',
  'truck-right': 'smooth truck right, maintaining distance',
  'zoom-in': 'smooth zoom in, focusing on subject',
  'zoom-out': 'smooth zoom out, revealing context',
};

export function buildStoryboardInterpolationPairs(
  frames: IImage[],
  prompt?: string,
): StoryboardInterpolationPair[] {
  const trimmedPrompt = prompt?.trim();

  return frames
    .slice(0, -1)
    .reduce<StoryboardInterpolationPair[]>((pairs, frame, index) => {
      const nextFrame = frames[index + 1];
      if (!frame.id || !nextFrame?.id) {
        return pairs;
      }

      pairs.push({
        endImageId: nextFrame.id,
        ...(trimmedPrompt ? { prompt: trimmedPrompt } : {}),
        startImageId: frame.id,
      });
      return pairs;
    }, []);
}

export function getStoryboardCameraPrompt(
  preset: CameraMovementPreset,
  customPrompt: string,
): string {
  if (preset === 'custom') {
    return customPrompt.trim();
  }

  return STORYBOARD_CAMERA_PROMPTS[preset];
}

export function resolveStoryboardDuration(duration: unknown): number {
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    return 5;
  }

  return Math.min(10, Math.max(3, Math.round(duration)));
}

export function resolveStoryboardFormat(format: unknown): IngredientFormat {
  return Object.values(IngredientFormat).includes(format as IngredientFormat)
    ? (format as IngredientFormat)
    : IngredientFormat.PORTRAIT;
}

export function resolveStoryboardModelKey(
  models: IModel[],
  configuredModelKeys?: string[],
): string {
  const explicitModel = configuredModelKeys?.find(Boolean);
  if (explicitModel) {
    return explicitModel;
  }

  return models.find((model) => model.isDefault)?.key ?? models[0]?.key ?? '';
}

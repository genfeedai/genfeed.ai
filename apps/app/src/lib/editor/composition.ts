import { nanoid } from 'nanoid';
import type {
  EditorComposition,
  EditorLaunchContext,
  EditorTimelineItem,
} from '@/lib/editor/types';

export const EDITOR_FPS = 30;

export const ASPECT_PRESETS = {
  landscape: { height: 1080, label: '16:9', width: 1920 },
  portrait: { height: 1920, label: '9:16', width: 1080 },
  square: { height: 1080, label: '1:1', width: 1080 },
} as const;

export type AspectPresetId = keyof typeof ASPECT_PRESETS;

export function detectEditorMediaType(assetPath: string): 'image' | 'video' {
  const normalized = assetPath.toLowerCase();
  if (
    normalized.endsWith('.mp4') ||
    normalized.endsWith('.webm') ||
    normalized.endsWith('.mov')
  ) {
    return 'video';
  }

  return 'image';
}

export function createTimelineItem(assetPath: string): EditorTimelineItem {
  return {
    durationInFrames:
      EDITOR_FPS * (detectEditorMediaType(assetPath) === 'video' ? 5 : 3),
    id: nanoid(),
    mediaType: detectEditorMediaType(assetPath),
    path: assetPath,
    trimEnd: 0,
    trimStart: 0,
  };
}

export function createCompositionFromLaunchContext(
  context: EditorLaunchContext,
  aspectPreset: AspectPresetId = 'landscape',
): EditorComposition {
  const preset = ASPECT_PRESETS[aspectPreset];

  return {
    fps: EDITOR_FPS,
    height: preset.height,
    id: nanoid(),
    items: context.assetPaths.map(createTimelineItem),
    overlay: undefined,
    width: preset.width,
  };
}

export function getCompositionDurationInFrames(
  composition: EditorComposition,
): number {
  return Math.max(
    composition.fps,
    composition.items.reduce(
      (total, item) => total + Math.max(1, item.durationInFrames),
      0,
    ),
  );
}

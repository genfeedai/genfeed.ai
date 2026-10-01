import type {
  MergeVideosParams,
  MergeVideosResult,
} from '@mcp/shared/interfaces/video.interface';

export const MERGE_VIDEOS_TOOL_NAMES = new Set(['merge_videos']);

/** Same message the video merge API returns when zoom is supplied. */
export const MERGE_ZOOM_UNSUPPORTED =
  'Zoom effects are not supported when merging videos';

function isVideoIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every((id) => typeof id === 'string' && id.trim().length > 0)
  );
}

function readOptionalBoolean(
  args: Record<string, unknown>,
  key: string,
): boolean | undefined {
  if (!Object.hasOwn(args, key)) return undefined;
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

function readOptionalNumber(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  if (!Object.hasOwn(args, key)) return undefined;
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${key} must be a number`);
  }
  return value;
}

function readOptionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  if (!Object.hasOwn(args, key)) return undefined;
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} must be a string`);
  }
  return value;
}

/**
 * Maps a merge_videos call onto the merge API. Zoom is rejected here so the
 * proxy cannot omit it and report a merge that never applied the effect.
 */
export function toMergeVideosParams(
  args: Record<string, unknown>,
): MergeVideosParams {
  if (args.zoomEaseCurve != null || args.zoomConfigs != null) {
    throw new Error(MERGE_ZOOM_UNSUPPORTED);
  }
  if (!isVideoIdList(args.ids)) {
    throw new Error('ids must list at least two video ids');
  }

  const isCaptionsEnabled = readOptionalBoolean(args, 'isCaptionsEnabled');
  const isMuteVideoAudio = readOptionalBoolean(args, 'isMuteVideoAudio');
  const isResizeEnabled = readOptionalBoolean(args, 'isResizeEnabled');
  const music = readOptionalString(args, 'music');
  const musicVolume = readOptionalNumber(args, 'musicVolume');
  const transition = readOptionalString(args, 'transition');
  const transitionDuration = readOptionalNumber(args, 'transitionDuration');
  const transitionEaseCurve = readOptionalString(args, 'transitionEaseCurve');

  return {
    ids: args.ids,
    ...(isCaptionsEnabled !== undefined ? { isCaptionsEnabled } : {}),
    ...(isMuteVideoAudio !== undefined ? { isMuteVideoAudio } : {}),
    ...(isResizeEnabled !== undefined ? { isResizeEnabled } : {}),
    ...(music !== undefined ? { music } : {}),
    ...(musicVolume !== undefined ? { musicVolume } : {}),
    ...(transition !== undefined ? { transition } : {}),
    ...(transitionDuration !== undefined ? { transitionDuration } : {}),
    ...(transitionEaseCurve !== undefined ? { transitionEaseCurve } : {}),
  };
}

export async function handleMergeVideosTool(
  client: {
    mergeVideos(params: MergeVideosParams): Promise<MergeVideosResult>;
  },
  args: Record<string, unknown>,
) {
  const params = toMergeVideosParams(args);
  const merged = await client.mergeVideos(params);
  return {
    structuredContent: { data: merged },
    content: [
      {
        text: `Video merge started.\n\nVideo ID: ${merged.id}\nStatus: ${merged.status}`,
        type: 'text',
      },
    ],
  };
}

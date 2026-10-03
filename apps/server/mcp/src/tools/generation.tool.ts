import { parseIngredientOrigin } from '@genfeedai/contracts';
import { isEntityId } from '@genfeedai/contracts/api-types/helpers/entity-id';
import type { ClientService } from '@mcp/services/client.service';
import { formatListResult } from '@mcp/shared/utils/format-list-result.util';

export const GENERATION_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  'get_video_status',
  'list_videos',
  'list_images',
  'list_avatars',
  'list_music',
]);

/**
 * The optional `origin` filter of the list tools. An unrecognised value is an
 * error, not "no filter": silently listing everything would hand back assets
 * the caller asked to exclude.
 */
function readOriginArg(args: Record<string, unknown>) {
  if (
    args?.origin === undefined ||
    args.origin === null ||
    args.origin === ''
  ) {
    return undefined;
  }

  const origin = parseIngredientOrigin(args.origin);
  if (!origin) {
    throw new Error('origin must be UPLOADED, GENERATED, IMPORTED or UNKNOWN');
  }

  return origin;
}

const MAX_CHARACTER_IDS = 25;

/**
 * The optional `characterIds` filter of the image and video list tools. A
 * malformed id is an error, not "no filter", for the same reason as `origin`.
 * Availability to the active brand is enforced by the API.
 */
function readCharacterIdsArg(
  args: Record<string, unknown>,
): string[] | undefined {
  const value = args?.characterIds;

  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    !Array.isArray(value) ||
    value.length > MAX_CHARACTER_IDS ||
    !value.every((entry): entry is string => isEntityId(entry))
  ) {
    throw new Error(
      `characterIds must be a list of up to ${MAX_CHARACTER_IDS} character ids`,
    );
  }

  return value.length > 0 ? Array.from(new Set(value)) : undefined;
}

export async function handleGenerationTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'get_video_status': {
      if (!args?.videoId) {
        throw new Error('videoId required');
      }
      const status = await client.getVideoStatus(args.videoId as string);
      return {
        structuredContent: { data: { ...status, id: args.videoId } },
        content: [
          {
            text: `Video Status: ${status.status}\nProgress: ${status.progress}%\n${status.message || ''}${status.url ? `\nURL: ${status.url}` : ''}`,
            type: 'text' as const,
          },
        ],
      };
    }
    case 'list_videos': {
      const limit = (args?.limit as number) || 10;
      const offset = (args?.offset as number) || 0;
      const videos = await client.listVideos(
        limit,
        offset,
        readOriginArg(args),
        readCharacterIdsArg(args),
      );
      return {
        structuredContent: { data: videos },
        content: [
          {
            text: formatListResult(videos, 'videos'),
            type: 'text' as const,
          },
        ],
      };
    }
    case 'list_images': {
      const images = await client.listImages({
        characterIds: readCharacterIdsArg(args),
        limit: args?.limit as number | undefined,
        offset: args?.offset as number | undefined,
        origin: readOriginArg(args),
      });
      return {
        structuredContent: { data: images },
        content: [
          {
            text: formatListResult(images, 'images'),
            type: 'text' as const,
          },
        ],
      };
    }
    case 'list_avatars': {
      const avatars = await client.listAvatars({
        limit: args?.limit as number | undefined,
        origin: readOriginArg(args),
      });
      return {
        structuredContent: { data: avatars },
        content: [
          {
            text: formatListResult(avatars, 'avatars'),
            type: 'text' as const,
          },
        ],
      };
    }
    case 'list_music': {
      const musicTracks = await client.listMusic({
        limit: args?.limit as number | undefined,
        origin: readOriginArg(args),
      });
      return {
        structuredContent: { data: musicTracks },
        content: [
          {
            text: formatListResult(musicTracks, 'music tracks'),
            type: 'text' as const,
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown generation tool: ${name}`);
  }
}

import { parseIngredientOrigin } from '@genfeedai/contracts';
import type { ClientService } from '@mcp/services/client.service';
import { formatListResult } from '@mcp/shared/utils/format-list-result.util';

export const GENERATION_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
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

export async function handleGenerationTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'list_videos': {
      const limit = (args?.limit as number) || 10;
      const offset = (args?.offset as number) || 0;
      const videos = await client.listVideos(
        limit,
        offset,
        readOriginArg(args),
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

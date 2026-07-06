import type {
  ClipGenerationMode,
  GenerateClipHighlightPayload,
  GenerateClipsParams,
} from '@mcp/services/client/clips.client';
import type { ClientService } from '@mcp/services/client.service';

export const CLIP_PROJECTS_TOOL_NAMES = new Set([
  'analyze_clip_project',
  'create_clip_project_from_youtube',
  'get_clip_highlights',
  'get_clip_project',
  'generate_clips',
  'list_clip_projects',
]);

/**
 * Clip-projects MCP handlers (issue #1245). Each entry is a thin proxy to the
 * live `clip-projects` API via {@link ClientService}; org scoping and credit
 * checks are enforced API-side. Writes (analyze / create / generate) are routed
 * through the approval gate in `tool-registry.service.ts`, so this handler only
 * runs for a create/generate once a reviewer has approved it.
 */
export function handleClipProjectsTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  const handlers: Record<
    string,
    (
      args: Record<string, unknown>,
    ) => Promise<{ content: Array<{ text: string; type: 'text' }> }>
  > = {
    analyze_clip_project: async (a) => {
      const result = await client.analyzeClipProject({
        language: optionalString(a, 'language'),
        maxClips: optionalNumber(a, 'maxClips'),
        minViralityScore: optionalNumber(a, 'minViralityScore'),
        name: optionalString(a, 'name'),
        youtubeUrl: requiredString(a, 'youtubeUrl'),
      });

      return textJsonResult('Started clip analysis', result);
    },
    create_clip_project_from_youtube: async (a) => {
      const result = await client.createClipProjectFromYoutube({
        avatarId: requiredString(a, 'avatarId'),
        avatarProvider: optionalString(a, 'avatarProvider'),
        language: optionalString(a, 'language'),
        maxClips: optionalNumber(a, 'maxClips'),
        minViralityScore: optionalNumber(a, 'minViralityScore'),
        name: optionalString(a, 'name'),
        voiceId: requiredString(a, 'voiceId'),
        youtubeUrl: requiredString(a, 'youtubeUrl'),
      });

      return textJsonResult('Started clip factory from YouTube', result);
    },
    generate_clips: async (a) => {
      const result = await client.generateClips(generateClipsParams(a));

      return textJsonResult('Started clip generation', result);
    },
    get_clip_highlights: async (a) => {
      const result = await client.getClipHighlights(
        requiredString(a, 'projectId'),
      );

      return textJsonResult('Clip highlights', result);
    },
    get_clip_project: async (a) => {
      const result = await client.getClipProject(
        requiredString(a, 'projectId'),
      );

      return textJsonResult('Clip project', result);
    },
    list_clip_projects: async (a) => {
      const result = await client.listClipProjects({
        limit: optionalNumber(a, 'limit'),
        offset: optionalNumber(a, 'offset'),
      });

      return {
        content: [
          {
            text:
              result.length > 0
                ? `Found ${result.length} clip projects:\n\n${JSON.stringify(result, null, 2)}`
                : 'No clip projects found.',
            type: 'text' as const,
          },
        ],
      };
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown clip projects tool: ${name}`);
  return handler(args);
}

function generateClipsParams(
  args: Record<string, unknown>,
): GenerateClipsParams {
  const mode = generationMode(args);
  const avatarId = optionalString(args, 'avatarId');
  const voiceId = optionalString(args, 'voiceId');

  // Avatar-mode inputs are enforced here rather than in the tool's JSON schema
  // so that raw-cut (which needs neither) works untouched once the API accepts
  // `mode` (#1238). Until then only avatar mode is functional.
  if (mode === 'avatar' && (!avatarId || !voiceId)) {
    throw new Error('avatarId and voiceId are required for avatar mode');
  }

  return {
    avatarId,
    avatarProvider: optionalString(args, 'avatarProvider'),
    editedHighlights: editedHighlights(args),
    mode,
    projectId: requiredString(args, 'projectId'),
    selectedHighlightIds: requiredStringArray(args, 'selectedHighlightIds'),
    voiceId,
  };
}

function generationMode(args: Record<string, unknown>): ClipGenerationMode {
  const value = args.mode;
  if (value === undefined || value === null) {
    return 'avatar';
  }
  if (value !== 'avatar' && value !== 'raw-cut') {
    throw new Error('mode must be "avatar" or "raw-cut"');
  }
  return value;
}

function editedHighlights(
  args: Record<string, unknown>,
): GenerateClipHighlightPayload[] {
  const value = args.editedHighlights;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('editedHighlights must be a non-empty array');
  }

  return value.map((entry, index) => {
    if (entry === null || typeof entry !== 'object') {
      throw new Error(`editedHighlights[${index}] must be an object`);
    }
    const record = entry as Record<string, unknown>;
    return {
      id: requiredString(record, 'id'),
      summary: requiredString(record, 'summary'),
      title: requiredString(record, 'title'),
    };
  });
}

function textJsonResult(label: string, data: unknown) {
  return {
    content: [
      {
        text: `${label}:\n\n${JSON.stringify(data, null, 2)}`,
        type: 'text' as const,
      },
    ],
  };
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function optionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function optionalNumber(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function requiredStringArray(
  args: Record<string, unknown>,
  key: string,
): string[] {
  const value = args[key];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string')
  ) {
    throw new Error(`${key} must be a non-empty array of strings`);
  }
  return value.map((item) => (item as string).trim()).filter(Boolean);
}

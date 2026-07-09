import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

/**
 * Clip-projects MCP surface (epic #1234 / issue #1245).
 *
 * Thin passthroughs to the live `clip-projects` API (no business logic in the
 * MCP layer): analyze a source video for highlights, review them, generate
 * clips, and read project/clip status + results — the same lifecycle the API
 * and frontend expose.
 *
 * Mode forward-compat: `generate_clips` advertises a `mode` (`avatar` |
 * `raw-cut`). Only `avatar` is functional today — the raw-cut generate contract
 * (#1238) is still in flight. The tool is shaped so raw-cut slots in with no
 * rewrite: the API's ValidationPipe strips the unknown `mode` field until #1238
 * lands, at which point the same request starts honoring it. Avatar-mode inputs
 * (`avatarId`/`voiceId`) are enforced conditionally in the handler rather than
 * as JSON-schema `required`, so raw-cut (which needs neither) works untouched
 * once the API supports it.
 */
export const MCP_CLIP_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Analyze a source video (YouTube URL) for viral highlights: downloads audio, transcribes, and LLM-detects highlight segments. Cheap step (1 credit). Returns a projectId to poll with get_clip_project and get_clip_highlights.',
    name: 'analyze_clip_project',
    parameters: {
      properties: {
        language: {
          default: 'en',
          description: 'Language code for transcription',
          type: 'string',
        },
        maxClips: {
          default: 10,
          description: 'Maximum number of highlights to detect (1-30)',
          maximum: 30,
          minimum: 1,
          type: 'number',
        },
        minViralityScore: {
          default: 50,
          description: 'Minimum virality score threshold (0-100)',
          maximum: 100,
          minimum: 0,
          type: 'number',
        },
        name: {
          description: 'Optional project name',
          type: 'string',
        },
        youtubeUrl: {
          description: 'YouTube video URL to analyze',
          type: 'string',
        },
      },
      required: ['youtubeUrl'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Create a clip project from a YouTube URL and run the full AI clip factory: analyze highlights and generate avatar video clips asynchronously. Expensive (one credit per clip). Requires an avatarId and voiceId. Returns a projectId to poll with get_clip_project.',
    name: 'create_clip_project_from_youtube',
    parameters: {
      properties: {
        avatarId: {
          description: 'Avatar ID for clip generation',
          type: 'string',
        },
        avatarProvider: {
          default: 'heygen',
          description: 'Avatar video provider to use',
          enum: ['heygen'],
          type: 'string',
        },
        language: {
          default: 'en',
          description: 'Language code for transcription',
          type: 'string',
        },
        maxClips: {
          default: 10,
          description: 'Maximum number of clips to generate (1-30)',
          maximum: 30,
          minimum: 1,
          type: 'number',
        },
        minViralityScore: {
          default: 50,
          description: 'Minimum virality score threshold (0-100)',
          maximum: 100,
          minimum: 0,
          type: 'number',
        },
        name: {
          description: 'Optional project name',
          type: 'string',
        },
        voiceId: {
          description: 'Voice ID for clip generation',
          type: 'string',
        },
        youtubeUrl: {
          description: 'YouTube video URL',
          type: 'string',
        },
      },
      required: ['youtubeUrl', 'avatarId', 'voiceId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      "Get the detected highlights for a clip project after analysis. Returns the highlights array plus the project's current status.",
    name: 'get_clip_highlights',
    parameters: {
      properties: {
        projectId: {
          description: 'The clip project ID',
          type: 'string',
        },
      },
      required: ['projectId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Read a clip project by ID: status, progress, highlights, and generated clip results (with playable video URLs when ready). Poll this after analyze or generate.',
    name: 'get_clip_project',
    parameters: {
      properties: {
        projectId: {
          description: 'The clip project ID',
          type: 'string',
        },
      },
      required: ['projectId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Generate video clips for selected highlights of an analyzed clip project. Expensive (one credit per clip). The project must be in "analyzed" status. Mode "avatar" (default, currently supported) requires avatarId and voiceId; mode "raw-cut" produces deterministic ffmpeg cuts of the source footage with burned captions and needs no avatar/voice (raw-cut requires API support — see #1238).',
    name: 'generate_clips',
    parameters: {
      properties: {
        avatarId: {
          description: 'Avatar ID (required for avatar mode)',
          type: 'string',
        },
        avatarProvider: {
          default: 'heygen',
          description: 'Avatar video provider to use (avatar mode)',
          enum: ['heygen'],
          type: 'string',
        },
        editedHighlights: {
          description:
            'Highlight payloads to persist before generation. One entry per selected highlight, each with its id, title, and summary (script).',
          items: {
            properties: {
              id: { description: 'Highlight ID', type: 'string' },
              summary: {
                description: 'Highlight script/summary to use for generation',
                type: 'string',
              },
              title: {
                description: 'Highlight title to use for generation',
                type: 'string',
              },
            },
            required: ['id', 'title', 'summary'],
            type: 'object',
          },
          type: 'array',
        },
        mode: {
          default: 'avatar',
          description:
            'Generation mode. "avatar" regenerates as an AI avatar (requires avatarId + voiceId). "raw-cut" cuts the original footage with burned captions (no avatar/voice; requires API support #1238).',
          enum: ['avatar', 'raw-cut'],
          type: 'string',
        },
        projectId: {
          description: 'The analyzed clip project ID',
          type: 'string',
        },
        selectedHighlightIds: {
          description: 'IDs of the highlights to generate clips from',
          items: { type: 'string' },
          type: 'array',
        },
        voiceId: {
          description: 'Voice ID (required for avatar mode)',
          type: 'string',
        },
      },
      required: ['projectId', 'selectedHighlightIds', 'editedHighlights'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'List clip projects in your organization, most recent first. Returns id, name, status, and progress for each.',
    name: 'list_clip_projects',
    parameters: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of projects to return',
          maximum: 50,
          type: 'number',
        },
        offset: {
          default: 0,
          description: 'Offset for pagination',
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
];

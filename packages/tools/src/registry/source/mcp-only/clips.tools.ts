import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

/**
 * Clip-projects MCP surface (epic #1234 / issue #1245).
 *
 * Thin passthroughs to the live `clip-projects` API (no business logic in the
 * MCP layer): analyze a source video for highlights, review them, generate
 * clips, and read project/clip status + results — the same lifecycle the API
 * and frontend expose.
 *
 * `generate_clips` advertises both supported modes (`avatar` | `raw-cut`).
 * Provider-specific avatar inputs are enforced conditionally in the handler
 * rather than as unconditional JSON-schema requirements.
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
  },
  {
    creditCost: 0,
    description:
      'Create a clip project from a YouTube URL and run the full AI clip factory asynchronously. Expensive (one credit per clip). HeyGen and Argil require avatarId and voiceId; GenfeedAI requires a brand character reference. Returns a projectId to poll with get_clip_project.',
    name: 'create_clip_project_from_youtube',
    parameters: {
      properties: {
        avatarId: {
          description: 'Avatar ID required by HeyGen and Argil',
          type: 'string',
        },
        avatarProvider: {
          default: 'heygen',
          description: 'Avatar video provider to use',
          enum: ['heygen', 'argil', 'genfeedai'],
          type: 'string',
        },
        brandId: {
          description:
            'Brand whose saved character reference and identity defaults should be used',
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
          description: 'Voice ID required by HeyGen and Argil',
          type: 'string',
        },
        youtubeUrl: {
          description: 'YouTube video URL',
          type: 'string',
        },
      },
      required: ['youtubeUrl'],
      type: 'object',
    },
    requiredRole: 'user',
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
  },
  {
    creditCost: 0,
    description:
      'Generate video clips for selected highlights of an analyzed clip project. Expensive (one credit per clip). The project must be in "analyzed" status. In avatar mode, HeyGen and Argil require avatarId and voiceId; GenfeedAI requires a selected reference frame or brand character reference. Raw-cut mode produces deterministic source-footage cuts with burned captions and needs no avatar or voice.',
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
          enum: ['heygen', 'argil', 'genfeedai'],
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
            'Generation mode. "avatar" uses the selected provider requirements. "raw-cut" cuts the original footage with burned captions and needs no avatar or voice.',
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
  },
];

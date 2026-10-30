import type { SourceTool } from '../../../interfaces/source-tool.interface';

/**
 * Studio Editor handoff (issue #5461).
 *
 * One write: seed a draft Editor project from existing video ingredients, in
 * timeline order, the same create the Generate, Storyboard, and Clips
 * "Open in Editor" actions use. The API stamps organization and brand from
 * the caller. Content stays off this tool because core + scheduler + content
 * is already at the bare MCP URL cap.
 *
 * Reads: list the organization's Editor projects and read one back. Render:
 * queue the project's export, the same call as the Editor's Export button.
 * The render route holds no credits, so the tool is a free direct write; the
 * result is read back with get_editor_project.
 */
export const MCP_EDITOR_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Open existing videos in the Studio Editor. Creates a draft Editor project seeded with sourceVideoIds in order (one clip each, up to 50) and returns its id and /editor path. Does not generate, render, or publish.',
    name: 'open_in_editor',
    parameters: {
      additionalProperties: false,
      properties: {
        name: {
          description:
            'Optional project name. Blank uses the Editor default, Untitled Project.',
          maxLength: 120,
          type: 'string',
        },
        sourceVideoIds: {
          description:
            'Existing video ingredient IDs, in timeline order. Each becomes one clip.',
          items: { minLength: 1, type: 'string' },
          maxItems: 50,
          minItems: 1,
          type: 'array',
        },
      },
      required: ['sourceVideoIds'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List Studio Editor projects, newest first, with name, status and clip count. Open one with get_editor_project.',
    name: 'list_editor_projects',
    parameters: {
      additionalProperties: false,
      properties: {
        limit: {
          default: 10,
          description: 'Projects to return (1-100)',
          maximum: 100,
          minimum: 1,
          type: 'number',
        },
        page: {
          default: 1,
          description: 'Page number, starting at 1',
          minimum: 1,
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Get one Studio Editor project by id: tracks, clips in timeline order, render status, the rendered video id once a render finishes, and the /editor path.',
    name: 'get_editor_project',
    parameters: {
      additionalProperties: false,
      properties: {
        projectId: {
          description: 'Editor project id',
          minLength: 1,
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
      'Queue the render of an Editor project into a new video, the same export the Editor runs. Costs no credits. Returns the render status; check progress and the finished video with get_editor_project (status and renderedVideo). Fails if the project is already rendering or has no clips.',
    name: 'start_editor_render',
    parameters: {
      additionalProperties: false,
      properties: {
        projectId: {
          description: 'Editor project id',
          minLength: 1,
          type: 'string',
        },
      },
      required: ['projectId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];

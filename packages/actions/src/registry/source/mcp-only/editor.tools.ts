import type { SourceTool } from '../../../interfaces/source-tool.interface';

/**
 * Studio Editor handoff (issue #5461).
 *
 * One write: seed a draft Editor project from existing video ingredients, in
 * timeline order, the same create the Generate, Storyboard, and Clips
 * "Open in Editor" actions use. The API stamps organization and brand from
 * the caller. Content stays off this tool because core + scheduler + content
 * is already at the bare MCP URL cap.
 */
export const MCP_EDITOR_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Open existing videos in the Studio Editor. Creates a draft Editor project seeded with sourceVideoIds in order (one clip each, up to 50) and returns its id and /studio/editor path. Does not generate, render, or publish.',
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
];

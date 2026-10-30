import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const AGENT_LIBRARY_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Star or unstar a Library asset so it appears under Starred. Starring is idempotent; pass isStarred false to remove the star. Use list_assets to find the asset id.',
    name: 'star_asset',
    parameters: {
      properties: {
        assetId: {
          description: 'Library asset ID to star or unstar',
          type: 'string',
        },
        isStarred: {
          description: 'true (default) stars the asset; false removes the star',
          type: 'boolean',
        },
      },
      required: ['assetId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];

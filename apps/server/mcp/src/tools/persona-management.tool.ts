import type { ClientService } from '@mcp/services/client.service';

export function createPersonaListTool(client: ClientService) {
  return {
    description: 'List AI personas/characters configured in Genfeed.',

    async handler(params: { status?: string; limit?: number }) {
      const result = await client.listPersonas({
        limit: params.limit || 20,
        status: params.status,
      });
      return {
        content: [
          {
            text: JSON.stringify(result, null, 2),
            type: 'text' as const,
          },
        ],
      };
    },
    inputSchema: {
      properties: {
        limit: {
          description: 'Max items to return',
          type: 'number',
        },
        status: {
          description: 'Filter by status (active, draft, paused)',
          type: 'string',
        },
      },
      required: [],
      type: 'object' as const,
    },
    name: 'list_personas',
  };
}

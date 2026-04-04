import type { ClientService } from '@mcp/services/client.service';

export function createLibraryResource(client: ClientService) {
  return {
    description:
      'Recent content from the Genfeed library including images, videos, and music.',

    async handler() {
      const library = await client.listImages({ limit: 50 });
      return {
        contents: [
          {
            mimeType: 'application/json',
            text: JSON.stringify(library, null, 2),
            uri: 'genfeed://library/recent',
          },
        ],
      };
    },
    name: 'Content Library',
    uri: 'genfeed://library/recent',
  };
}

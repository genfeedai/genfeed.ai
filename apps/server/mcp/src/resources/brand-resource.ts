import type { ClientService } from '@mcp/services/client.service';

export function createBrandResource(client: ClientService) {
  return {
    description:
      'Active brand configuration including voice, style, and connected accounts.',

    async handler() {
      const brands = await client.listBrands();
      return {
        contents: [
          {
            mimeType: 'application/json',
            text: JSON.stringify(brands, null, 2),
            uri: 'genfeed://brand/active',
          },
        ],
      };
    },
    name: 'Brand Configuration',
    uri: 'genfeed://brand/active',
  };
}

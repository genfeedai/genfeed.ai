import { get } from './client.js';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api.js';

export interface Brand {
  id: string;
  label: string;
  handle?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export async function listBrands(organizationId: string): Promise<Brand[]> {
  const response = await get<JsonApiCollectionResponse>(`/organizations/${organizationId}/brands`);
  return flattenCollection<Brand>(response);
}

export async function getBrand(id: string): Promise<Brand> {
  const response = await get<JsonApiSingleResponse>(`/brands/${id}`);
  return flattenSingle<Brand>(response);
}

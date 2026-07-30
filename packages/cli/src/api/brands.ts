import { get } from './client';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api';

export interface Brand {
  id: string;
  label: string;
  slug?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export async function listBrands(organizationId: string): Promise<Brand[]> {
  const query = new URLSearchParams({ organization: organizationId });
  const response = await get<JsonApiCollectionResponse>(`/brands?${query.toString()}`);
  return flattenCollection<Brand>(response);
}

export async function getBrand(id: string): Promise<Brand> {
  const response = await get<JsonApiSingleResponse>(`/brands/${id}`);
  return flattenSingle<Brand>(response);
}

import { get, post } from './client.js';
import { flattenCollection, type JsonApiCollectionResponse } from './json-api.js';

export interface OrganizationOption {
  id: string;
  label: string;
  isActive: boolean;
  brand: {
    id: string;
    label: string;
  } | null;
}

export interface SwitchOrganizationResponse {
  organization: {
    id: string;
    label: string;
  };
  brand: {
    id: string;
    label: string;
  };
}

export async function listMyOrganizations(): Promise<OrganizationOption[]> {
  const response = await get<JsonApiCollectionResponse>('/organizations/mine');
  return flattenCollection<OrganizationOption>(response);
}

export async function switchOrganization(id: string): Promise<SwitchOrganizationResponse> {
  return post<SwitchOrganizationResponse>(`/organizations/switch/${id}`, {});
}

import type { OrganizationOption } from '@genfeedai/interfaces';
import { get, patch } from './client';

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
  return get<OrganizationOption[]>('/organizations?mine=true');
}

export async function switchOrganization(id: string): Promise<SwitchOrganizationResponse> {
  return patch<SwitchOrganizationResponse>(`/organizations/${id}/activate`);
}

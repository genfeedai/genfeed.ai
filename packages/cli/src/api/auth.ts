import { get } from './client.js';

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Organization {
  id: string;
  name: string;
}

export interface WhoamiResponse {
  user: User;
  organization: Organization;
  scopes: string[];
}

export async function whoami(): Promise<WhoamiResponse> {
  const response = await get<{ data: WhoamiResponse }>('/auth/whoami');
  return response.data;
}

export async function validateApiKey(): Promise<WhoamiResponse> {
  return whoami();
}

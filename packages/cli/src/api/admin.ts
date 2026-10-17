import type { IOrganizationAppsReport } from '@genfeedai/contracts/interfaces';
import { get } from './client';
import { flattenSingle, type JsonApiSingleResponse } from './json-api';

export async function getOrganizationAppsReport(): Promise<IOrganizationAppsReport> {
  const response = await get<JsonApiSingleResponse>('/admin/organization-apps');
  return flattenSingle<IOrganizationAppsReport>(response);
}

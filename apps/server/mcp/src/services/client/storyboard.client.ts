import { storyboardRunSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { BaseApiClient } from '@mcp/services/client/base-api-client';
import type { AxiosResponse } from 'axios';

export function storyboardRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value));
}

export function parseStoryboardRun(
  base: BaseApiClient,
  response: AxiosResponse,
) {
  const resource = base.unwrapObject<Record<string, unknown>>(response);
  const attributes = storyboardRecord(resource.attributes);
  return storyboardRunSchema.parse({
    ...attributes,
    ...(typeof resource.id === 'string' ? { id: resource.id } : {}),
  });
}

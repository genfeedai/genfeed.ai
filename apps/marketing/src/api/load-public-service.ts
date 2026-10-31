import type { PublicService } from '@services/external/public.service';

/**
 * The public API client, loaded on first use.
 *
 * `PublicService` brings axios, the HTTP interceptors, and the JSON:API models
 * (~20 KB gzip). The website's tools only call it after a visitor submits, so
 * a static import put all of it on their first load for nothing.
 */
export async function loadPublicService(): Promise<PublicService> {
  const { PublicService } = await import('@services/external/public.service');
  return PublicService.getInstance();
}

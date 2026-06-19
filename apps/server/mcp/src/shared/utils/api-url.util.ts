/**
 * Normalize the configured Genfeed API base URL so it always targets the API's
 * `/v1` global prefix exactly once.
 *
 * `GENFEEDAI_API_URL` is configured WITHOUT the prefix in every environment
 * (`.env.example` → `http://local.genfeed.ai:3010`, all docker-compose →
 * `http://api:3010`, terraform → `http://api.genfeed.internal:3010`), but the
 * NestJS API runs `setGlobalPrefix('v1')`. The MCP `ClientService` and
 * `AuthService` therefore have to include `/v1` or every request 404s. This
 * helper appends it only when the base does not already end in a version
 * segment, so it stays correct if an environment ever bakes the prefix in.
 */
export function resolveApiBaseUrl(rawUrl: string | undefined): string {
  const trimmed = (rawUrl ?? '').trim().replace(/\/+$/, '');

  if (!trimmed) {
    return '';
  }

  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

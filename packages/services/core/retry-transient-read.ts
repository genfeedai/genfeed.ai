import { logger } from '@services/core/logger.service';

/** The reads this app makes are public GETs, so repeating one is always safe. */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);
const TRANSIENT_NETWORK_CODES: ReadonlySet<string> = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNRESET',
  'ETIMEDOUT',
]);

function readStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const { response, status } = error as {
    response?: { status?: unknown };
    status?: unknown;
  };
  const value = typeof status === 'number' ? status : response?.status;

  return typeof value === 'number' ? value : undefined;
}

/**
 * A gateway answer (502, 503, 504) or a dropped connection: the API did not
 * say anything about the resource, so asking again can succeed. A 404, a 4xx
 * or a parse error is an answer and is never repeated.
 */
export function isTransientReadFailure(error: unknown): boolean {
  const status = readStatus(error);

  if (status !== undefined) {
    return TRANSIENT_STATUSES.has(status);
  }

  const { code } = (error ?? {}) as { code?: unknown };

  return typeof code === 'string' && TRANSIENT_NETWORK_CODES.has(code);
}

/**
 * Runs `read` up to three times, half a second apart, while it fails
 * transiently, then rethrows the last failure unchanged. `next build`
 * prerenders hundreds of pages against the live API; one gateway blip must not
 * abort the whole build, and a page that still cannot be read fails loudly
 * rather than rendering a 404 for content that exists. Only the status is
 * logged, never the response body.
 */
export async function retryTransientRead<T>(
  label: string,
  read: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isTransientReadFailure(error)) {
        throw error;
      }

      logger.warn('Transient public read failure, retrying', {
        attempt,
        label,
        status: readStatus(error),
      });
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

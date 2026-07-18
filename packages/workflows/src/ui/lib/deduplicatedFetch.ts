/**
 * Deduplicated Fetch Utility
 *
 * When multiple callers request the same URL concurrently, only one
 * actual network request is made. All callers receive the same response
 * data once the request completes. Responses are cached for 5 seconds.
 */

const inFlightRequests = new Map<string, Promise<Response>>();

const responseCache = new Map<
  string,
  {
    status: number;
    headers: Record<string, string>;
    bodyText: string;
    timestamp: number;
  }
>();

const CACHE_TTL = 5000;

const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function getCacheKey(url: string, headers?: HeadersInit): string {
  if (!headers) return url;

  const headerObj =
    headers instanceof Headers
      ? Object.fromEntries(headers.entries())
      : Array.isArray(headers)
        ? Object.fromEntries(headers)
        : headers;

  const sortedHeaders = Object.keys(headerObj as Record<string, string>)
    .sort()
    .map((k) => `${k}:${(headerObj as Record<string, string>)[k]}`)
    .join('|');

  return `${url}|${sortedHeaders}`;
}

/**
 * Fetch with request deduplication.
 *
 * Multiple concurrent calls to the same URL (with same headers) will
 * share a single network request. The response is cloned for each caller.
 */
export async function deduplicatedFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const cacheKey = getCacheKey(url, options?.headers);

  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return new Response(cached.bodyText, {
      headers: cached.headers,
      status: cached.status,
    });
  }

  const existingRequest = inFlightRequests.get(cacheKey);
  if (existingRequest) {
    await existingRequest;
    const cachedData = responseCache.get(cacheKey);
    if (cachedData) {
      return new Response(cachedData.bodyText, {
        headers: cachedData.headers,
        status: cachedData.status,
      });
    }
    return new Response(JSON.stringify({ error: 'Cache miss' }), {
      status: 500,
    });
  }

  const requestPromise = fetch(url, options)
    .then(async (response) => {
      try {
        const bodyText = await response.clone().text();
        responseCache.set(cacheKey, {
          bodyText,
          headers: Object.fromEntries(response.headers.entries()),
          status: response.status,
          timestamp: Date.now(),
        });
      } catch {
        // Failed to read response body for caching
      }
      return response;
    })
    .finally(() => {
      const timeoutId = setTimeout(() => {
        inFlightRequests.delete(cacheKey);
        pendingTimeouts.delete(cacheKey);
      }, 50);
      pendingTimeouts.set(cacheKey, timeoutId);
    });

  inFlightRequests.set(cacheKey, requestPromise);

  return requestPromise;
}

/**
 * Clear all cached responses.
 */
export function clearFetchCache(): void {
  responseCache.clear();
  inFlightRequests.clear();
  for (const timeoutId of pendingTimeouts.values()) {
    clearTimeout(timeoutId);
  }
  pendingTimeouts.clear();
}

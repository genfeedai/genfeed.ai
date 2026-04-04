import type { Page, Route } from '@playwright/test';

interface BlockedRequest {
  host: string;
  method: string;
  reason: string;
  url: string;
}

interface NetworkGuardOptions {
  allowedHosts?: string[];
  strict?: boolean;
}

interface NetworkGuardHandle {
  assertNoBlockedRequests: () => void;
  getBlockedRequests: () => BlockedRequest[];
}

const ALWAYS_BLOCKED_API_HOST_PATTERNS: RegExp[] = [
  /(^|\.)api\.genfeed\.ai$/i,
  /(^|\.)api\.openai\.com$/i,
  /(^|\.)api\.anthropic\.com$/i,
  /(^|\.)api\.elevenlabs\.io$/i,
  /(^|\.)api\.heygen\.com$/i,
  /(^|\.)api\.stripe\.com$/i,
  /(^|\.)api\.replicate\.com$/i,
  /(^|\.)api\.fal\.ai$/i,
  /(^|\.)api\.together\.xyz$/i,
  /(^|\.)api\.stability\.ai$/i,
];

const DEFAULT_ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
  'local.genfeed.ai', // local dev API host (requests are intercepted by page.route())
  'cdn.genfeed.ai',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'img.clerk.com',
  'images.clerk.dev',
];

const DEFAULT_ALLOWED_HOST_SUFFIXES = [
  '.clerk.accounts.dev',
  '.clerk.com',
  '.google-analytics.com',
  '.googletagmanager.com',
];

function isBypassUrl(url: string): boolean {
  return (
    url.startsWith('about:') ||
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    url.startsWith('file:')
  );
}

function toHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAlwaysBlockedApiHost(host: string): boolean {
  return ALWAYS_BLOCKED_API_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

function isStrictModeEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

function isHostAllowed(host: string, allowedHosts: Set<string>): boolean {
  if (allowedHosts.has(host)) {
    return true;
  }

  return DEFAULT_ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export async function setupStrictNetworkGuard(
  page: Page,
  options: NetworkGuardOptions = {},
): Promise<NetworkGuardHandle> {
  const strict =
    options.strict ?? isStrictModeEnabled(process.env.E2E_STRICT_NETWORK);
  const allowedHosts = new Set([
    ...DEFAULT_ALLOWED_HOSTS,
    ...(options.allowedHosts ?? []),
  ]);
  const blockedRequests: BlockedRequest[] = [];

  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const requestUrl = request.url();

    if (isBypassUrl(requestUrl)) {
      await route.continue();
      return;
    }

    const host = toHost(requestUrl);
    if (!host) {
      await route.continue();
      return;
    }

    if (isAlwaysBlockedApiHost(host)) {
      blockedRequests.push({
        host,
        method: request.method(),
        reason: 'blocked-cost-risk-api-host',
        url: requestUrl,
      });
      await route.abort('blockedbyclient');
      return;
    }

    if (strict && !isHostAllowed(host, allowedHosts)) {
      blockedRequests.push({
        host,
        method: request.method(),
        reason: 'blocked-strict-non-local-host',
        url: requestUrl,
      });
      await route.abort('blockedbyclient');
      return;
    }

    await route.continue();
  });

  return {
    assertNoBlockedRequests: (): void => {
      if (blockedRequests.length === 0) {
        return;
      }

      const details = blockedRequests
        .map(
          (request) =>
            `[${request.reason}] ${request.method} ${request.host} (${request.url})`,
        )
        .join('\n');

      throw new Error(
        `Blocked outbound requests detected during E2E run:\n${details}`,
      );
    },
    getBlockedRequests: (): BlockedRequest[] => [...blockedRequests],
  };
}

import type { Page, Route } from '@playwright/test';
import { playwrightApiHostname } from '../config/environment';

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
  playwrightApiHostname, // configured local dev API host (intercepted by page.route())
  'local.genfeed.ai', // temporary backwards-compatible local host allowlist
  'cdn.genfeed.ai',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// PostHog (the only tracker) requires a build-time NEXT_PUBLIC_POSTHOG_KEY,
// which E2E builds never set — no analytics hosts need allowlisting.
const DEFAULT_ALLOWED_HOST_SUFFIXES: string[] = [];

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

  // Client crashes in a production build are otherwise invisible — the error
  // boundary swallows the stack and CI only sees "element(s) not found".
  // Surface every uncaught page error in the test output, symbolicated when
  // the build served source maps (E2E_COVERAGE=1 in the e2e workflow).
  page.on('pageerror', (error) => {
    void (async () => {
      const stack = error.stack ?? '(no stack)';
      const resolved = await symbolicateStack(page, stack);
      console.error(
        `[pageerror] ${error.message}\n${stack}${
          resolved.length > 0 ? `\n  symbolicated:\n${resolved.join('\n')}` : ''
        }`,
      );
    })();
  });

  // Service-layer failures log the operation name and URL through the app
  // logger before rethrowing — mirror them here so a minified pageerror stack
  // can be traced to the exact endpoint.
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.error(`[console.error] ${message.text()}`);
    }
  });

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

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

interface RawSourceMap {
  mappings: string;
  names: string[];
  sources: string[];
}

function decodeVlqSegment(segment: string): number[] {
  const values: number[] = [];
  let shift = 0;
  let value = 0;

  for (const char of segment) {
    const digit = BASE64_ALPHABET.indexOf(char);
    if (digit === -1) {
      return values;
    }
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      values.push(value & 1 ? -(value >>> 1) : value >>> 1);
      shift = 0;
      value = 0;
    }
  }

  return values;
}

function resolveOriginalPosition(
  map: RawSourceMap,
  generatedLine: number,
  generatedColumn: number,
): string | null {
  const lines = map.mappings.split(';');
  if (generatedLine >= lines.length) {
    return null;
  }

  let sourceIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  let nameIndex = 0;
  let best: {
    source: number;
    line: number;
    column: number;
    name: number | null;
  } | null = null;

  for (let line = 0; line <= generatedLine; line += 1) {
    let generated = 0;
    const segments = lines[line] ?? '';
    if (!segments) {
      continue;
    }
    for (const segment of segments.split(',')) {
      const decoded = decodeVlqSegment(segment);
      if (decoded.length === 0) {
        continue;
      }
      generated += decoded[0];
      if (decoded.length >= 4) {
        sourceIndex += decoded[1];
        sourceLine += decoded[2];
        sourceColumn += decoded[3];
        if (decoded.length >= 5) {
          nameIndex += decoded[4];
        }
        if (line === generatedLine && generated <= generatedColumn) {
          best = {
            column: sourceColumn,
            line: sourceLine,
            name: decoded.length >= 5 ? nameIndex : null,
            source: sourceIndex,
          };
        }
      }
    }
  }

  if (!best) {
    return null;
  }

  const source = map.sources[best.source] ?? '(unknown source)';
  const name = best.name === null ? '' : ` (${map.names[best.name] ?? ''})`;

  return `${source}:${best.line + 1}:${best.column + 1}${name}`;
}

async function symbolicateStack(page: Page, stack: string): Promise<string[]> {
  const resolvedFrames: string[] = [];
  const frames = [
    ...stack.matchAll(/(https?:\/\/[^\s)]+?\.js):(\d+):(\d+)/g),
  ].slice(0, 5);

  for (const [, url, lineText, columnText] of frames) {
    try {
      const response = await page.request.get(`${url}.map`, { timeout: 5000 });
      if (!response.ok()) {
        continue;
      }
      const map = (await response.json()) as RawSourceMap;
      const original = resolveOriginalPosition(
        map,
        Number(lineText) - 1,
        Number(columnText) - 1,
      );
      if (original) {
        resolvedFrames.push(
          `    ${url}:${lineText}:${columnText} -> ${original}`,
        );
      }
    } catch {
      // Source maps are best-effort debugging aid; never fail the guard.
    }
  }

  return resolvedFrames;
}

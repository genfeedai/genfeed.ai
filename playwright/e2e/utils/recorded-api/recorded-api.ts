import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page, Route } from '@playwright/test';
import {
  createPlaywrightMockApiRoutePattern,
  playwrightApiEndpoint,
  playwrightApiOrigin,
} from '../../config/environment';
import {
  type ApiRecording,
  createNormalizer,
  createReplayMatcher,
  entryKey,
  findRecordingViolations,
  formatViolations,
  parseRecording,
  RECORDING_FORMAT_VERSION,
  type RecordedApiEntry,
  serializeRecording,
  toRequestKey,
} from './recording';

export const RECORDINGS_DIRECTORY = path.resolve(__dirname, '../../recordings');

export type RecordedApiMode = 'record' | 'replay';

export interface RecordedApiHandle {
  mode: RecordedApiMode;
  /** Throws, naming each request, when the page asked for something unrecorded. */
  assertAllRequestsMatched: () => void;
  /** Record mode only: writes the recording after the safety scan passes. */
  finish: () => Promise<void>;
  unmatchedRequests: () => string[];
}

const CORS_HEADERS = {
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-allow-origin': '*',
};

export function resolveRecordedApiMode(
  env: NodeJS.ProcessEnv = process.env,
): RecordedApiMode {
  if (env.E2E_RECORD !== '1') {
    return 'replay';
  }
  if (env.CI) {
    throw new Error(
      'E2E_RECORD=1 is refused in CI. Recordings are made locally against a seeded backend and committed.',
    );
  }
  return 'record';
}

function recordingPath(surface: string): string {
  return path.join(RECORDINGS_DIRECTORY, `${surface}.recording.json`);
}

/**
 * Serves every API response for `surface` from its committed recording.
 *
 * Replay is strict: a request the recording has no response for is answered
 * with a 599 and reported by `assertAllRequestsMatched`, which names the method
 * and path. Record mode (local only, `E2E_RECORD=1`) forwards requests to the
 * seeded backend at `E2E_RECORD_API_ORIGIN` and writes what it saw.
 */
export async function installRecordedApi(
  page: Page,
  surface: string,
): Promise<RecordedApiHandle> {
  const mode = resolveRecordedApiMode();
  const unmatched: string[] = [];
  const recorded: RecordedApiEntry[] = [];
  const normalizer = createNormalizer();
  const replayMatcher =
    mode === 'replay'
      ? createReplayMatcher(
          parseRecording(
            readFileSync(recordingPath(surface), 'utf8'),
            recordingPath(surface),
          ),
        )
      : undefined;
  const recordOrigin = process.env.E2E_RECORD_API_ORIGIN ?? playwrightApiOrigin;

  await page.route(createPlaywrightMockApiRoutePattern(), async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 });
      return;
    }
    const key =
      toRequestKey(request.url(), playwrightApiEndpoint) ??
      toRequestKey(request.url(), 'https://api.genfeed.ai/v1');
    if (!key) {
      await route.fallback();
      return;
    }

    if (replayMatcher) {
      await replay(route, request.method(), key, replayMatcher, unmatched);
      return;
    }
    await record(route, request.method(), key, recorded, normalizer);
  });

  return {
    assertAllRequestsMatched() {
      if (unmatched.length > 0) {
        throw new Error(
          `${unmatched.length} API request(s) had no recorded response:\n${unmatched.map((message) => `- ${message}`).join('\n')}`,
        );
      }
    },
    async finish() {
      if (mode !== 'record') {
        return;
      }
      const recording: ApiRecording = {
        entries: recorded,
        surface,
        version: RECORDING_FORMAT_VERSION,
      };
      const violations = findRecordingViolations(recording);
      if (violations.length > 0) {
        throw new Error(
          `Refusing to write the "${surface}" recording. It must hold seeded fixture data only:\n${formatViolations(violations)}`,
        );
      }
      mkdirSync(RECORDINGS_DIRECTORY, { recursive: true });
      writeFileSync(recordingPath(surface), serializeRecording(recording));
    },
    mode,
    unmatchedRequests: () => [...unmatched],
  };

  async function replay(
    activeRoute: Route,
    method: string,
    requestKey: { path: string; query: string },
    matcher: NonNullable<typeof replayMatcher>,
    misses: string[],
  ): Promise<void> {
    const result = matcher.match(method, requestKey.path, requestKey.query);
    if (!result.entry) {
      misses.push(result.message ?? entryKey({ method, ...requestKey }));
      await activeRoute.fulfill({
        body: JSON.stringify({ error: result.message }),
        contentType: 'application/json',
        headers: CORS_HEADERS,
        status: 599,
      });
      return;
    }
    await activeRoute.fulfill({
      body: JSON.stringify(result.entry.body),
      contentType: result.entry.contentType,
      headers: CORS_HEADERS,
      status: result.entry.status,
    });
  }

  async function record(
    activeRoute: Route,
    method: string,
    requestKey: { path: string; query: string },
    sink: RecordedApiEntry[],
    activeNormalizer: ReturnType<typeof createNormalizer>,
  ): Promise<void> {
    const url = `${recordOrigin}${new URL(playwrightApiEndpoint).pathname.replace(/\/+$/u, '')}${requestKey.path}${requestKey.query ? `?${requestKey.query}` : ''}`;
    const response = await activeRoute.fetch({ url });
    const contentType = response.headers()['content-type'] ?? '';
    if (contentType.includes('text/event-stream')) {
      throw new Error(
        `Cannot record ${method} ${requestKey.path}: server-sent events are not recorded. Keep a hand-written mock for streaming surfaces.`,
      );
    }
    sink.push({
      body: activeNormalizer.normalizeJson(await response.json()),
      contentType: contentType || 'application/json',
      method,
      path: activeNormalizer.normalizeText(requestKey.path),
      query: activeNormalizer.normalizeQuery(requestKey.query),
      status: response.status(),
    });
    await activeRoute.fulfill({ response });
  }
}

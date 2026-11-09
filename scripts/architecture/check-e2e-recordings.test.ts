import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type ApiRecording,
  createNormalizer,
  createReplayMatcher,
  findRecordingViolations,
  toRequestKey,
} from '../../playwright/e2e/utils/recorded-api/recording';
import { checkRecordings } from './check-e2e-recordings';

function recordingWithBody(body: unknown): ApiRecording {
  return {
    entries: [
      {
        body,
        contentType: 'application/json',
        method: 'GET',
        path: '/users/me',
        query: '',
        status: 200,
      },
    ],
    surface: 'fixture',
    version: 1,
  };
}

describe('replay matching', () => {
  const recording: ApiRecording = {
    entries: [
      {
        body: 'first',
        contentType: 'application/json',
        method: 'GET',
        path: '/runs',
        query: '',
        status: 200,
      },
      {
        body: 'second',
        contentType: 'application/json',
        method: 'GET',
        path: '/runs',
        query: '',
        status: 200,
      },
    ],
    surface: 'runs',
    version: 1,
  };

  it('replays repeated requests in order and repeats the last response', () => {
    const matcher = createReplayMatcher(recording);
    const bodies = ['first', 'second', 'second'].map(
      () => matcher.match('GET', '/runs', '').entry?.body,
    );
    expect(bodies).toEqual(['first', 'second', 'second']);
  });

  it('names the method and path of an unmatched request', () => {
    const miss = createReplayMatcher(recording).match('POST', '/runs', '');
    expect(miss.entry).toBeUndefined();
    expect(miss.message).toContain('POST /runs');
    expect(miss.message).toContain('"runs" recording');
  });

  it('treats a different query as a different request', () => {
    const miss = createReplayMatcher(recording).match('GET', '/runs', 'page=2');
    expect(miss.message).toContain('GET /runs?page=2');
  });

  it('splits request URLs below the API endpoint and ignores other origins', () => {
    expect(
      toRequestKey(
        'http://genfeed.localhost:3010/v1/runs?b=2&a=1',
        'http://genfeed.localhost:3010/v1',
      ),
    ).toEqual({ path: '/runs', query: 'a=1&b=2' });
    expect(
      toRequestKey(
        'https://other.example.com/v1/runs',
        'http://genfeed.localhost:3010/v1',
      ),
    ).toBeNull();
  });
});

describe('normalization', () => {
  it('gives the same id the same placeholder across text and JSON', () => {
    const normalizer = createNormalizer();
    const id = '64b7f0c2a1d3e4f5a6b7c8d9';
    expect(normalizer.normalizeText(`/runs/${id}`)).toBe('/runs/id-1');
    expect(
      normalizer.normalizeJson({
        id,
        parent: id,
        other: '123e4567-e89b-12d3-a456-426614174000',
      }),
    ).toEqual({
      id: 'id-1',
      other: 'id-2',
      parent: 'id-1',
    });
  });

  it('fixes timestamps and strips signed URL queries', () => {
    const normalizer = createNormalizer();
    expect(
      normalizer.normalizeJson({
        at: '2026-11-09T21:30:07.123Z',
        url: 'https://cdn.genfeed.ai/a.png?Signature=abc&Expires=99&w=200',
      }),
    ).toEqual({
      at: '2026-01-01T00:00:00.000Z',
      url: 'https://cdn.genfeed.ai/a.png?signed=redacted',
    });
    expect(normalizer.normalizeQuery('z=1&token=secret&a=2')).toBe('a=2&z=1');
  });
});

describe('recording safety scan', () => {
  it('accepts fixture data', () => {
    expect(
      findRecordingViolations(
        recordingWithBody({
          data: {
            attributes: {
              avatar: 'https://cdn.genfeed.ai/mock/a.png',
              email: 'qa@example.com',
              token: undefined,
            },
          },
        }),
      ),
    ).toEqual([]);
  });

  it.each([
    [
      'a JWT',
      {
        note: [
          'eyJhbGciOiJIUzI1NiJ9',
          'eyJzdWIiOiIxMjM0NTY3ODkwIn0',
          'abcdefghijk',
        ].join('.'),
      },
      /JWT/u,
    ],
    [
      'a Stripe key',
      { note: ['sk', 'live', 'abcdefghijklmnop'].join('_') },
      /Stripe/u,
    ],
    ['a key under a sensitive name', { apiKey: 'not-redacted' }, /apiKey/u],
    [
      'a production hostname',
      { url: 'https://api.genfeed.ai/v1/users' },
      /api\.genfeed\.ai/u,
    ],
    ['a real email', { owner: 'someone@gmail.com' }, /someone@gmail\.com/u],
  ])('rejects %s', (_name, body, reason) => {
    const violations = findRecordingViolations(recordingWithBody(body));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((violation) => violation.reason).join('\n')).toMatch(
      reason,
    );
  });
});

describe('recording guard', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { force: true, recursive: true });
    }
  });

  function rootWith(recording: unknown): string {
    const root = mkdtempSync(path.join(tmpdir(), 'e2e-recordings-'));
    roots.push(root);
    const directory = path.join(root, 'playwright/e2e/recordings');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, 'fixture.recording.json'),
      JSON.stringify(recording),
    );
    return root;
  }

  it('fails a committed recording that contains a fake token', () => {
    const result = checkRecordings({
      rootDir: rootWith(
        recordingWithBody({ refreshToken: 'ghp_abcdefghijklmnopqrstuvwxyz' }),
      ),
    });
    expect(result.violations.map((violation) => violation.file)).toContain(
      'playwright/e2e/recordings/fixture.recording.json',
    );
  });

  it('passes a clean recording and fails a malformed one', () => {
    expect(
      checkRecordings({ rootDir: rootWith(recordingWithBody({ ok: true })) })
        .violations,
    ).toEqual([]);
    expect(
      checkRecordings({ rootDir: rootWith({ nope: true }) }).violations[0]
        ?.reason,
    ).toContain('not a version 1 API recording');
  });
});

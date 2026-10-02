import type {
  PublicationCaptureAttempt,
  PublicationCaptureConfirmed,
} from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import { expect, it } from 'vitest';
import {
  parsePublicationCaptureOutbox,
  publicationCaptureEntryFromConfirmed,
} from '~services/publication-capture-record';
import {
  parsePublicationCaptureAttempt,
  publicationCaptureAttemptAllowsUrl,
  validPublicationCaptureObservation,
} from '~services/publication-capture-validation';

const now = Date.parse('2026-10-03T00:00:00Z');
const attempt: PublicationCaptureAttempt = {
  id: '11111111-1111-4111-8111-111111111111',
  scope: {
    userId: 'user',
    organizationId: 'org',
    brandId: 'brand',
    revision: 1,
  },
  startedAt: now,
  documentUrl: 'https://x.com/compose/post',
  authorHandle: 'author',
  description: 'Own reply',
  baselineIds: ['123'],
  surface: {
    kind: 'x-reply-modal',
    returnUrl: 'https://x.com/other/status/123',
    replyIntentId: '22222222-2222-4222-8222-222222222222',
    parent: { externalId: '123', url: 'https://x.com/other/status/123' },
  },
};
const observation = {
  attemptId: attempt.id,
  externalId: '456',
  url: 'https://x.com/author/status/456',
  authorHandle: 'author',
  description: attempt.description,
  publicationDate: new Date(now).toISOString(),
};
it('normalizes only legacy home attempts without mutating their stored bytes', () => {
  const { surface: _surface, ...legacy } = attempt;
  const home = { ...legacy, documentUrl: 'https://x.com/home?tab=following' };
  const original = structuredClone(home);
  expect(parsePublicationCaptureAttempt(home)?.surface).toEqual({
    kind: 'x-home',
  });
  expect(home).toEqual(original);
  expect(parsePublicationCaptureAttempt(legacy)).toBeNull();
});
it('requires explicit modal surface and exact same-origin parent, token and baseline', () => {
  expect(parsePublicationCaptureAttempt(attempt)).toEqual(attempt);
  for (const surface of [
    { ...attempt.surface, extra: true },
    {
      kind: 'x-reply-modal',
      returnUrl: 'https://x.com/other/status/123',
      parent: { externalId: '123', url: 'https://x.com/other/status/123' },
    },
    { ...attempt.surface, replyIntentId: 'wrong' },
    {
      ...attempt.surface,
      parent: { externalId: '456', url: 'https://x.com/other/status/123' },
    },
    {
      ...attempt.surface,
      parent: {
        externalId: '123',
        url: 'https://evil.example/other/status/123',
      },
    },
    {
      ...attempt.surface,
      parent: {
        externalId: '123',
        url: 'https://x.com/other/status/123?extra=1',
      },
    },
    { kind: 'x-post-modal', returnUrl: 'https://x.com/compose/post' },
  ])
    expect(parsePublicationCaptureAttempt({ ...attempt, surface })).toBeNull();
  expect(
    parsePublicationCaptureAttempt({ ...attempt, baselineIds: [] }),
  ).toBeNull();
});
it('keeps exact modal return routes and home variants distinct', () => {
  for (const url of [
    'https://x.com/compose/post',
    'https://x.com/compose/post/',
    'https://x.com/other/status/123',
  ])
    expect(publicationCaptureAttemptAllowsUrl(attempt, url)).toBe(true);
  for (const url of [
    'https://x.com/home',
    'https://x.com/other/status/123#reply',
    'https://twitter.com/compose/post',
    'https://evil.example/compose/post',
  ])
    expect(publicationCaptureAttemptAllowsUrl(attempt, url)).toBe(false);
  expect(
    publicationCaptureAttemptAllowsUrl(
      { ...attempt, surface: { kind: 'x-post-modal', returnUrl: null } },
      'https://x.com/home',
    ),
  ).toBe(false);
});
it('validates own reply identity and original time without promoting parent or quotes', () => {
  expect(validPublicationCaptureObservation(attempt, observation, now)).toBe(
    true,
  );
  for (const change of [
    { externalId: '123', url: 'https://x.com/author/status/123' },
    { authorHandle: 'other' },
    { description: 'changed' },
    { url: 'https://x.com/author/status/456#reply' },
    { publicationDate: new Date(now + 61000).toISOString() },
  ])
    expect(
      validPublicationCaptureObservation(
        attempt,
        { ...observation, ...change },
        now,
      ),
    ).toBe(false);
});
it.each(['post', 'reply'] as const)(
  'projects and parses durable %s without changing kind or original date',
  (kind) => {
    const confirmed: PublicationCaptureConfirmed = {
      binding: { tabId: 1, origin: 'https://x.com' },
      attempt: {
        ...attempt,
        surface:
          kind === 'reply'
            ? attempt.surface
            : { kind: 'x-post-modal', returnUrl: null },
      },
      observation,
      observedAt: now,
    };
    const entry = publicationCaptureEntryFromConfirmed(confirmed);
    expect(entry.input.publicationKind).toBe(kind);
    const stored = { ...entry, status: 'recording' };
    expect(parsePublicationCaptureOutbox([stored], new Set())[0]).toMatchObject(
      {
        status: 'queued',
        input: {
          publicationKind: kind,
          publicationDate: observation.publicationDate,
        },
      },
    );
    expect(
      parsePublicationCaptureOutbox([stored], new Set([entry.id]))[0].status,
    ).toBe('recording');
    expect(() =>
      parsePublicationCaptureOutbox(
        [entry, { ...entry, id: 'bad' }],
        new Set(),
      ),
    ).toThrow('Existing storage has been preserved');
  },
);

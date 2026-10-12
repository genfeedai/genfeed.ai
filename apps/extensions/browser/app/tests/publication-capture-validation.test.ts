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
  ).toBe(true);
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

const LINKEDIN = 'https://www.linkedin.com';
const POST = 'urn:li:activity:7100000000000000001';
const COMMENT =
  'urn:li:comment:(activity:7100000000000000001,7100000000000000002)';
const linkedInPost: PublicationCaptureAttempt = {
  id: attempt.id,
  scope: attempt.scope,
  startedAt: now,
  documentUrl: `${LINKEDIN}/feed/`,
  authorHandle: null,
  description: 'Own post',
  baselineIds: ['urn:li:activity:7000000000000000001'],
  surface: { kind: 'linkedin-post' },
};
const linkedInReply: PublicationCaptureAttempt = {
  ...linkedInPost,
  description: 'Own comment',
  baselineIds: [POST],
  surface: {
    kind: 'linkedin-comment',
    parent: { externalId: POST, url: `${LINKEDIN}/feed/update/${POST}/` },
  },
};
const linkedInObservation = {
  attemptId: attempt.id,
  externalId: POST,
  url: `${LINKEDIN}/feed/update/${POST}/`,
  authorHandle: 'own-author',
  description: 'Own post',
  publicationDate: new Date(now).toISOString(),
};
const commentObservation = {
  ...linkedInObservation,
  externalId: COMMENT,
  url: `${LINKEDIN}/feed/update/${POST}/?commentUrn=${encodeURIComponent(COMMENT)}`,
  description: 'Own comment',
};
it('parses LinkedIn post and comment attempts and rejects a surface from another platform', () => {
  expect(parsePublicationCaptureAttempt(linkedInPost)).toEqual(linkedInPost);
  expect(parsePublicationCaptureAttempt(linkedInReply)).toEqual(linkedInReply);
  for (const change of [
    { authorHandle: 'someone' },
    { documentUrl: 'https://x.com/home' },
    { documentUrl: 'https://evil.example/feed/' },
    { baselineIds: ['123'] },
    { surface: { kind: 'linkedin-post', extra: true } },
    { surface: { kind: 'x-home' } },
  ])
    expect(
      parsePublicationCaptureAttempt({ ...linkedInPost, ...change }),
    ).toBeNull();
  for (const change of [
    { baselineIds: [] },
    {
      surface: {
        kind: 'linkedin-comment',
        parent: {
          externalId: POST,
          url: `${LINKEDIN}/feed/update/${POST}/?x=1`,
        },
      },
    },
    {
      surface: {
        kind: 'linkedin-comment',
        parent: {
          externalId: POST,
          url: `${LINKEDIN}/feed/update/urn:li:activity:7100000000000000009/`,
        },
      },
    },
  ])
    expect(
      parsePublicationCaptureAttempt({ ...linkedInReply, ...change }),
    ).toBeNull();
  expect(
    parsePublicationCaptureAttempt({
      ...attempt,
      documentUrl: `${LINKEDIN}/feed/`,
    }),
  ).toBeNull();
});
it('keeps a LinkedIn attempt on the page it was submitted from', () => {
  expect(
    publicationCaptureAttemptAllowsUrl(linkedInPost, `${LINKEDIN}/feed/?x=1`),
  ).toBe(true);
  for (const url of [
    `${LINKEDIN}/messaging/`,
    'https://linkedin.com/feed/',
    'https://x.com/feed/',
  ])
    expect(publicationCaptureAttemptAllowsUrl(linkedInPost, url)).toBe(false);
});
it('validates a LinkedIn publication by its permalink, kind and time', () => {
  expect(
    validPublicationCaptureObservation(linkedInPost, linkedInObservation, now),
  ).toBe(true);
  expect(
    validPublicationCaptureObservation(
      linkedInPost,
      { ...linkedInObservation, authorHandle: null },
      now,
    ),
  ).toBe(true);
  expect(
    validPublicationCaptureObservation(linkedInReply, commentObservation, now),
  ).toBe(true);
  for (const change of [
    { url: `${LINKEDIN}/feed/update/${POST}` },
    { url: `${LINKEDIN}/feed/update/${POST}/?trackingId=1` },
    { url: `${LINKEDIN}/feed/update/urn:li:activity:7100000000000000009/` },
    {
      externalId: 'urn:li:activity:7000000000000000001',
      url: `${LINKEDIN}/feed/update/urn:li:activity:7000000000000000001/`,
    },
    { description: 'changed' },
    { externalId: COMMENT, url: commentObservation.url },
    { publicationDate: new Date(now + 61000).toISOString() },
    { authorHandle: 'a' },
  ])
    expect(
      validPublicationCaptureObservation(
        linkedInPost,
        { ...linkedInObservation, ...change },
        now,
      ),
    ).toBe(false);
  // A comment attempt cannot publish a post, or a comment under another post.
  expect(
    validPublicationCaptureObservation(
      linkedInReply,
      { ...linkedInObservation, description: 'Own comment' },
      now,
    ),
  ).toBe(false);
  const other =
    'urn:li:comment:(activity:7100000000000000009,7100000000000000002)';
  expect(
    validPublicationCaptureObservation(
      linkedInReply,
      {
        ...commentObservation,
        externalId: other,
        url: `${LINKEDIN}/feed/update/urn:li:activity:7100000000000000009/?commentUrn=${encodeURIComponent(other)}`,
      },
      now,
    ),
  ).toBe(false);
  // The platform of the observation must be the platform of the attempt.
  expect(
    validPublicationCaptureObservation(attempt, linkedInObservation, now),
  ).toBe(false);
});
it.each([
  ['post', linkedInPost, linkedInObservation, 'post'],
  ['comment', linkedInReply, commentObservation, 'reply'],
] as const)(
  'projects a LinkedIn %s to a URL-only record that survives storage',
  (_name, original, seen, kind) => {
    const confirmed: PublicationCaptureConfirmed = {
      binding: { tabId: 1, origin: LINKEDIN },
      attempt: original,
      observation: seen,
      observedAt: now,
    };
    const entry = publicationCaptureEntryFromConfirmed(confirmed);
    expect(entry.input).toEqual({
      brandId: 'brand',
      platform: 'linkedin',
      publicationKind: kind,
      description: original.description,
      publicationDate: seen.publicationDate,
      url: seen.url,
      author: { handle: 'own-author' },
      observedVisibility: 'unknown',
    });
    expect(parsePublicationCaptureOutbox([entry], new Set())[0].input).toEqual(
      entry.input,
    );
    for (const change of [
      { platform: 'twitter' },
      { externalId: seen.externalId },
      { publicationKind: kind === 'post' ? 'reply' : 'post' },
      { url: `${seen.url}#fragment` },
    ])
      expect(() =>
        parsePublicationCaptureOutbox(
          [{ ...entry, input: { ...entry.input, ...change } }],
          new Set(),
        ),
      ).toThrow('Existing storage has been preserved');
    expect(() =>
      parsePublicationCaptureOutbox(
        [{ ...entry, sourceBinding: { tabId: 1, origin: 'https://x.com' } }],
        new Set(),
      ),
    ).toThrow('Existing storage has been preserved');
  },
);
it('sends a LinkedIn share or UGC URN as the provider id and leaves author out when unread', () => {
  const share = 'urn:li:ugcPost:7100000000000000004';
  const entry = publicationCaptureEntryFromConfirmed({
    binding: { tabId: 1, origin: LINKEDIN },
    attempt: linkedInPost,
    observation: {
      ...linkedInObservation,
      externalId: share,
      url: `${LINKEDIN}/feed/update/${share}/`,
      authorHandle: null,
    },
    observedAt: now,
  });
  expect(entry.input).toMatchObject({ externalId: share });
  expect(entry.input).not.toHaveProperty('author');
  expect(parsePublicationCaptureOutbox([entry], new Set())[0].input).toEqual(
    entry.input,
  );
});

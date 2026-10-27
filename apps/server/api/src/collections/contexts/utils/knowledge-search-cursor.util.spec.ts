import {
  decodeKnowledgeSearchCursor,
  encodeKnowledgeSearchCursor,
  InvalidKnowledgeSearchCursorError,
  knowledgeSearchFingerprint,
} from '@api/collections/contexts/utils/knowledge-search-cursor.util';
import { describe, expect, it } from 'vitest';

const fingerprint = knowledgeSearchFingerprint(['org-a', 'brand-a', 'zephyr']);

describe('knowledge search cursor', () => {
  it('round-trips a position for the same search', () => {
    const cursor = encodeKnowledgeSearchCursor(
      { entryId: 'entry-1', score: '0.812345' },
      fingerprint,
    );
    expect(decodeKnowledgeSearchCursor(cursor, fingerprint)).toEqual({
      entryId: 'entry-1',
      score: '0.812345',
    });
  });

  it('round-trips a timeline position and keeps it apart from a score position', () => {
    const cursor = encodeKnowledgeSearchCursor(
      { entryId: 'entry-1', occurredAt: '2026-06-15T00:00:00.000Z' },
      fingerprint,
    );
    expect(decodeKnowledgeSearchCursor(cursor, fingerprint)).toEqual({
      entryId: 'entry-1',
      occurredAt: '2026-06-15T00:00:00.000Z',
    });
    const both = Buffer.from(
      JSON.stringify({
        f: fingerprint,
        i: 'entry-1',
        s: '0.5',
        t: '2026-06-15T00:00:00.000Z',
        v: 1,
      }),
    ).toString('base64url');
    expect(() => decodeKnowledgeSearchCursor(both, fingerprint)).toThrow(
      InvalidKnowledgeSearchCursorError,
    );
    const badTime = Buffer.from(
      JSON.stringify({ f: fingerprint, i: 'e', t: "now'; --", v: 1 }),
    ).toString('base64url');
    expect(() => decodeKnowledgeSearchCursor(badTime, fingerprint)).toThrow(
      InvalidKnowledgeSearchCursorError,
    );
  });

  it('rejects a cursor from a different query, filter set or tenant', () => {
    const cursor = encodeKnowledgeSearchCursor(
      { entryId: 'entry-1', score: '0.5' },
      fingerprint,
    );
    for (const other of [
      ['org-b', 'brand-a', 'zephyr'],
      ['org-a', 'brand-a', 'other query'],
    ]) {
      expect(() =>
        decodeKnowledgeSearchCursor(cursor, knowledgeSearchFingerprint(other)),
      ).toThrow(InvalidKnowledgeSearchCursorError);
    }
  });

  it.each([
    ['empty', ''],
    ['not base64 json', '%%%'],
    ['oversized', 'a'.repeat(513)],
    ['a bare number', Buffer.from('7').toString('base64url')],
    [
      'a score that is not a decimal',
      Buffer.from(
        JSON.stringify({ f: fingerprint, i: 'e', s: "1' OR 1=1", v: 1 }),
      ).toString('base64url'),
    ],
    [
      'an entry id with unsafe characters',
      Buffer.from(
        JSON.stringify({ f: fingerprint, i: "e'; --", s: '0.1', v: 1 }),
      ).toString('base64url'),
    ],
  ])('rejects %s', (_label, cursor) => {
    expect(() => decodeKnowledgeSearchCursor(cursor, fingerprint)).toThrow(
      InvalidKnowledgeSearchCursorError,
    );
  });
});

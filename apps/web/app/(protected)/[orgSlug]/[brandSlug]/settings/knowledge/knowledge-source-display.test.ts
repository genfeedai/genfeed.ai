import {
  KnowledgeProcessingState,
  KnowledgeSourceKind,
} from '@genfeedai/contracts';
import type { KnowledgeSourceRow } from '@props/content/knowledge-library.props';
import { describe, expect, it } from 'vitest';
import {
  classifyFailure,
  getSourceLink,
  getSourceSnippet,
} from './knowledge-source-display';

function rowWith(
  source: Record<string, unknown>,
  version: Record<string, unknown> = {},
): KnowledgeSourceRow {
  return {
    source: { kind: KnowledgeSourceKind.URL, ...source },
    spaceIds: [],
    version: {
      processingState: KnowledgeProcessingState.READY,
      ...version,
    },
  } as unknown as KnowledgeSourceRow;
}

describe('classifyFailure', () => {
  it.each([
    ['getaddrinfo ENOTFOUND example.invalid', 'unreachable'],
    ['Fetch failed (503)', 'unreachable'],
    ['No extractable text in PDF', 'noText'],
    [
      'Action contract output validation failed [action=knowledge.source.extract workflow=w1]',
      'invalidResult',
    ],
    [
      'Request to https://api.replicate.com/v1/models/x/predictions failed with status 404 Not Found',
      'serviceUnavailable',
    ],
    ['Something nobody planned for', 'unknown'],
    [null, 'unknown'],
  ])('reads %j as %s', (error, expected) => {
    expect(classifyFailure(error)).toBe(expected);
  });
});

describe('getSourceLink', () => {
  it.each([
    [
      { referenceUrl: 'https://www.brand.example/pricing?plan=pro' },
      'brand.example/pricing?plan=pro',
    ],
    [{ referenceUrl: 'https://brand.example/' }, 'brand.example'],
    [{ referenceUrl: 'http://brand.example/a/b' }, 'brand.example/a/b'],
  ])('labels %j as %s', (source, label) => {
    expect(getSourceLink(rowWith(source))?.label).toBe(label);
  });

  it('shortens a very long address', () => {
    const link = getSourceLink(
      rowWith({ referenceUrl: `https://brand.example/${'a'.repeat(120)}` }),
    );
    expect(link?.label).toHaveLength(64);
    expect(link?.label.endsWith('…')).toBe(true);
  });

  it.each([
    { referenceUrl: 'javascript:alert(1)' },
    { referenceUrl: 'data:text/html;base64,PHNjcmlwdD4=' },
    { referenceUrl: 'not a url' },
    { referenceUrl: null },
  ])('has no link for %j', (source) => {
    expect(getSourceLink(rowWith(source))).toBeNull();
  });

  it('falls back to the version provenance when the source has no address', () => {
    const link = getSourceLink(
      rowWith(
        { referenceUrl: null },
        { provenance: { url: 'https://brand.example/about' } },
      ),
    );
    expect(link?.href).toBe('https://brand.example/about');
  });
});

describe('getSourceSnippet', () => {
  it('flattens whitespace in pasted text', () => {
    expect(
      getSourceSnippet(
        rowWith(
          { kind: KnowledgeSourceKind.TEXT },
          { payload: { text: 'We speak\n\nplainly.' } },
        ),
      ),
    ).toBe('We speak plainly.');
  });

  it('leaves the extracted text of a web page out of the list', () => {
    expect(
      getSourceSnippet(
        rowWith(
          { kind: KnowledgeSourceKind.URL },
          { payload: { text: 'Extracted page text' } },
        ),
      ),
    ).toBeNull();
  });

  it('has no snippet for a source without pasted text', () => {
    expect(getSourceSnippet(rowWith({}, { payload: null }))).toBeNull();
  });
});

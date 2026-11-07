import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  escapeHtmlStrict,
  escapeHtmlText,
} from './escape-html.helper';

const HOSTILE = `<a href="x" onclick='y'>Tom & Jerry / co</a>`;

describe('escape-html.helper', () => {
  it.each([
    ['', ''],
    ['plain text', 'plain text'],
    ['a & b', 'a &amp; b'],
    ['<b>bold</b>', '&lt;b&gt;bold&lt;/b&gt;'],
    ['&lt;', '&amp;lt;'],
  ])('escapeHtmlText(%j) returns %j', (input, expected) => {
    expect(escapeHtmlText(input)).toBe(expected);
  });

  it('escapeHtmlText leaves quotes and slashes alone', () => {
    expect(escapeHtmlText(`"it's" a/b`)).toBe(`"it's" a/b`);
  });

  it('escapeHtml escapes quotes so values are safe inside attributes', () => {
    expect(escapeHtml(HOSTILE)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;Tom &amp; Jerry / co&lt;/a&gt;',
    );
  });

  it('escapeHtmlStrict also escapes slashes and writes the apostrophe as &#x27;', () => {
    expect(escapeHtmlStrict(HOSTILE)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#x27;y&#x27;&gt;Tom &amp; Jerry &#x2F; co&lt;&#x2F;a&gt;',
    );
  });
});

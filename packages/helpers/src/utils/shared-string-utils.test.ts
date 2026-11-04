import { formatSnakeCaseLabel } from '@helpers/formatting/format/format.helper';
import { stripHtmlToSingleLine } from '@helpers/security/strip-html.helper';
import { parseCommaList } from '@helpers/utils/comma-list.util';
import { isValidTimestampMs } from '@helpers/utils/date-range.util';
import { isHostOrSubdomain } from '@helpers/utils/host.util';
import { escapeRegExp } from '@helpers/utils/regexp.util';
import { describe, expect, it } from 'vitest';

describe('shared string utils', () => {
  it.each([
    ['1.2.3', '1\\.2\\.3'],
    ['a+b (c)', 'a\\+b \\(c\\)'],
    ['plain', 'plain'],
  ])('escapes %s for literal regexp matching', (input, expected) => {
    expect(escapeRegExp(input)).toBe(expected);
  });

  it.each([
    ['a, b ,,c', ['a', 'b', 'c']],
    ['', []],
    [' , ', []],
  ])('parses comma list %j', (input, expected) => {
    expect(parseCommaList(input)).toEqual(expected);
  });

  it.each([
    ['youtube.com', 'youtube.com', true],
    ['m.youtube.com', 'youtube.com', true],
    ['notyoutube.com', 'youtube.com', false],
  ])('matches host %s against %s', (host, domain, expected) => {
    expect(isHostOrSubdomain(host, domain)).toBe(expected);
  });

  it.each([
    ['needs_review', 'Needs Review'],
    ['draft', 'Draft'],
  ])('labels %s as %s', (input, expected) => {
    expect(formatSnakeCaseLabel(input)).toBe(expected);
  });

  it('flattens html to a single line', () => {
    expect(stripHtmlToSingleLine('<p>Hello</p><p>big   world</p>')).toBe(
      'Hello big world',
    );
  });

  it.each([
    [0, true],
    [8.64e15, true],
    [8.64e15 + 2, false],
    [1.5, false],
  ])('validates timestamp %s as %s', (value, expected) => {
    expect(isValidTimestampMs(value)).toBe(expected);
  });
});

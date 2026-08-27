import { describe, expect, it } from 'vitest';
import { replaceMarkup } from './strip-markup.util';

describe('replaceMarkup', () => {
  it('replaces complete tags while preserving text', () => {
    expect(replaceMarkup('<p>Hello <strong>world</strong></p>', ' ')).toBe(
      ' Hello  world  ',
    );
  });

  it('preserves malformed fragments that have no closing angle bracket', () => {
    expect(replaceMarkup('Hello <strong world', ' ')).toBe(
      'Hello <strong world',
    );
  });

  it('removes complete script and style blocks when requested', () => {
    expect(
      replaceMarkup(
        '<p>Hello</p><script>alert(1)</script><style>p{color:red}</style>world',
        '',
        true,
      ),
    ).toBe('Helloworld');
  });

  it('does not mistake less-than signs in blocked content for tag starts', () => {
    expect(
      replaceMarkup('<script>if (a<b) { alert(1); }</script>x', '', true),
    ).toBe('x');
    expect(
      replaceMarkup("<style>a::before{content:'<'}</style>x", '', true),
    ).toBe('x');
  });

  it('preserves an unclosed blocked element body like the previous matcher', () => {
    expect(replaceMarkup('<script>visible fallback', '', true)).toBe(
      'visible fallback',
    );
  });

  it('handles long malformed markup without repeated rescans', () => {
    const input = '<'.repeat(50_000);
    expect(replaceMarkup(input, ' ')).toBe(input);
  });
  it('preserves empty angle brackets that are not markup tags', () => {
    expect(replaceMarkup('before <> after', ' ')).toBe('before <> after');
  });

  it('strips blocked elements case-insensitively', () => {
    expect(replaceMarkup('<SCRIPT>alert(1)</SCRIPT>ok', '', true)).toBe('ok');
  });

  it('leaves plain text unchanged', () => {
    expect(replaceMarkup('no markup here', ' ')).toBe('no markup here');
  });
});

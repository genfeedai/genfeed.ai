import {
  escapeDrawtextValue,
  ffmpegEscapeString,
} from '@files/helpers/utils/string/string.util';

describe('ffmpegEscapeString', () => {
  it('replaces single quotes with typographic apostrophes', () => {
    const result = ffmpegEscapeString("it's a test");

    expect(result).toBe('it\u2019s a test');
  });

  it('escapes backslashes', () => {
    const result = ffmpegEscapeString('C:\\temp\\file');

    expect(result).toBe('C:\\\\temp\\\\file');
  });

  it('escapes quotes and slashes together', () => {
    const result = ffmpegEscapeString("path\\to\\file's");

    expect(result).toBe('path\\\\to\\\\file\u2019s');
  });

  it('returns unchanged string when no escaping is needed', () => {
    const result = ffmpegEscapeString('plain-text');

    expect(result).toBe('plain-text');
  });
});

describe('escapeDrawtextValue', () => {
  it('escapes quotes so they cannot terminate the option value', () => {
    expect(escapeDrawtextValue("it's")).toBe("it\\'s");
  });

  it('escapes colons so they cannot start a new filter option', () => {
    expect(escapeDrawtextValue('12:30')).toBe('12\\:30');
  });

  it('escapes backslashes before the characters that introduce them', () => {
    // The regression: escaping `'` first turns `a\'` into `a\\'`, which ffmpeg
    // reads as a literal backslash followed by a closing quote.
    expect(escapeDrawtextValue("a\\'")).toBe("a\\\\\\'");
  });

  it('leaves no odd-length backslash run before an escaped quote', () => {
    const escaped = escapeDrawtextValue("a\\'");
    const trailing = escaped.slice(0, escaped.lastIndexOf("'"));
    const backslashes = trailing.match(/\\*$/)?.[0].length ?? 0;

    // Even count => every backslash is itself escaped => the quote stays
    // escaped rather than terminating the value.
    expect(backslashes % 2).toBe(0);
  });

  it('escapes a lone trailing backslash', () => {
    expect(escapeDrawtextValue('caption\\')).toBe('caption\\\\');
  });

  it('escapes percent so text expansion cannot be triggered', () => {
    expect(escapeDrawtextValue('%{pts}')).toBe('\\%{pts}');
  });

  it('passes ordinary text through unchanged', () => {
    expect(escapeDrawtextValue('Hello world')).toBe('Hello world');
  });

  it('handles the empty string', () => {
    expect(escapeDrawtextValue('')).toBe('');
  });
});

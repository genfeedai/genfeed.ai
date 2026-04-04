import { ffmpegEscapeString } from '@files/helpers/utils/string/string.util';

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

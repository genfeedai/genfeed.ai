import { ffmpegEscapeString } from '@api/helpers/utils/string/string.util';

describe('StringUtil', () => {
  describe('ffmpegEscapeString', () => {
    it('should escape single quotes', () => {
      const input = "Hello 'world' test";
      const result = ffmpegEscapeString(input);
      expect(result).toContain('world');
      expect(result).not.toContain("'");
    });

    it('should escape backslashes', () => {
      const input = 'C:\\Users\\Test\\file.txt';
      const expected = 'C:\\\\Users\\\\Test\\\\file.txt';
      expect(ffmpegEscapeString(input)).toBe(expected);
    });

    it('should handle empty string', () => {
      const input = '';
      const expected = '';
      expect(ffmpegEscapeString(input)).toBe(expected);
    });

    it('should handle string without special characters', () => {
      const input = 'Hello world';
      const expected = 'Hello world';
      expect(ffmpegEscapeString(input)).toBe(expected);
    });

    it('should handle multiple consecutive backslashes', () => {
      const input = '\\\\\\test\\\\\\';
      const expected = '\\\\\\\\\\\\test\\\\\\\\\\\\';
      expect(ffmpegEscapeString(input)).toBe(expected);
    });
  });
});

import { ffmpegEscapeString } from '@api/helpers/utils/string/string.util';

describe('StringUtil', () => {
  describe('ffmpegEscapeString', () => {
    it('should escape single quotes', () => {
      const input = "Hello 'world' test";
      const result = ffmpegEscapeString(input);
      expect(result).toContain('world');
      expect(result).not.toContain("'");
    });
  });
});

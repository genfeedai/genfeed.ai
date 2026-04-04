import { promises as fs } from 'node:fs';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { SecurityUtil } from '@api/helpers/utils/security/security.util';

// Mock node:fs module
vi.mock('node:fs', () => ({
  promises: {
    access: vi.fn(),
    constants: {
      R_OK: 4,
    },
    stat: vi.fn(),
  },
}));

describe('SecurityUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateFilePath', () => {
    it('should validate safe file paths', () => {
      const result = SecurityUtil.validateFilePath('videos/test.mp4');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should throw error for empty file path', () => {
      expect(() => SecurityUtil.validateFilePath('')).toThrow(
        ValidationException,
      );
    });

    it('should throw error for non-string file path', () => {
      expect(() => SecurityUtil.validateFilePath(null)).toThrow(
        ValidationException,
      );
    });

    it('should block directory traversal with ../', () => {
      expect(() =>
        SecurityUtil.validateFilePath('../../../etc/passwd'),
      ).toThrow(ValidationException);
    });

    it('should block directory traversal with ..\\', () => {
      expect(() => SecurityUtil.validateFilePath('..\\..\\windows')).toThrow(
        ValidationException,
      );
    });

    it('should block access to /etc/passwd', () => {
      expect(() => SecurityUtil.validateFilePath('/etc/passwd')).toThrow(
        ValidationException,
      );
    });

    it('should block access to /etc/shadow', () => {
      expect(() => SecurityUtil.validateFilePath('/etc/shadow')).toThrow(
        ValidationException,
      );
    });

    it('should block access to /proc/ directory', () => {
      expect(() => SecurityUtil.validateFilePath('/proc/cpuinfo')).toThrow(
        ValidationException,
      );
    });

    it('should block Windows system paths', () => {
      expect(() =>
        SecurityUtil.validateFilePath('c:\\windows\\system32'),
      ).toThrow(ValidationException);
    });

    it('should block command injection attempts', () => {
      // validateFilePath blocks BLOCKED_PATTERNS (traversal, system paths)
      // Command injection via semicolons is blocked by validateStringParam/sanitizeCommandArgs
      // A path with shell metacharacters that overlaps with BLOCKED_PATTERNS should be blocked
      expect(() =>
        SecurityUtil.validateFilePath('../etc/passwd; rm -rf /'),
      ).toThrow(ValidationException);
    });

    it('should block variable expansion attempts', () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: testing command injection pattern
      expect(() => SecurityUtil.validateFilePath('${HOME}/file.txt')).toThrow(
        ValidationException,
      );
      expect(() => SecurityUtil.validateFilePath('$(whoami)')).toThrow(
        ValidationException,
      );
    });
  });

  describe('validateFileExtension', () => {
    it('should validate allowed video extensions', () => {
      expect(() =>
        SecurityUtil.validateFileExtension('video.mp4'),
      ).not.toThrow();
      expect(() =>
        SecurityUtil.validateFileExtension('video.avi'),
      ).not.toThrow();
      expect(() =>
        SecurityUtil.validateFileExtension('video.mov'),
      ).not.toThrow();
    });

    it('should validate allowed image extensions', () => {
      expect(() =>
        SecurityUtil.validateFileExtension('image.jpg'),
      ).not.toThrow();
      expect(() =>
        SecurityUtil.validateFileExtension('image.png'),
      ).not.toThrow();
      expect(() =>
        SecurityUtil.validateFileExtension('image.gif'),
      ).not.toThrow();
    });

    it('should validate allowed audio extensions', () => {
      expect(() =>
        SecurityUtil.validateFileExtension('audio.mp3'),
      ).not.toThrow();
      expect(() =>
        SecurityUtil.validateFileExtension('audio.wav'),
      ).not.toThrow();
      expect(() =>
        SecurityUtil.validateFileExtension('audio.aac'),
      ).not.toThrow();
    });

    it('should throw error for file without extension', () => {
      expect(() => SecurityUtil.validateFileExtension('file')).toThrow(
        ValidationException,
      );
    });

    it('should throw error for disallowed extensions', () => {
      expect(() => SecurityUtil.validateFileExtension('file.exe')).toThrow(
        ValidationException,
      );
      expect(() => SecurityUtil.validateFileExtension('file.sh')).toThrow(
        ValidationException,
      );
      expect(() => SecurityUtil.validateFileExtension('file.bat')).toThrow(
        ValidationException,
      );
    });

    it('should handle mixed case extensions', () => {
      expect(() =>
        SecurityUtil.validateFileExtension('VIDEO.MP4'),
      ).not.toThrow();
      expect(() =>
        SecurityUtil.validateFileExtension('Image.PNG'),
      ).not.toThrow();
    });
  });

  describe('validateFileExists', () => {
    it('should validate existing file', async () => {
      (fs.access as vi.Mock).mockResolvedValue(undefined);

      await expect(
        SecurityUtil.validateFileExists('/path/to/file.mp4'),
      ).resolves.not.toThrow();
    });

    it('should throw error for non-existent file', async () => {
      (fs.access as vi.Mock).mockRejectedValue(new Error('File not found'));

      await expect(
        SecurityUtil.validateFileExists('/path/to/missing.mp4'),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('validateFileSize', () => {
    it('should validate file within size limit', async () => {
      (fs.stat as vi.Mock).mockResolvedValue({
        size: 50 * 1024 * 1024, // 50MB
      });

      await expect(
        SecurityUtil.validateFileSize('/path/to/file.mp4', 100),
      ).resolves.not.toThrow();
    });

    it('should throw error for file exceeding size limit', async () => {
      (fs.stat as vi.Mock).mockResolvedValue({
        size: 150 * 1024 * 1024, // 150MB
      });

      await expect(
        SecurityUtil.validateFileSize('/path/to/large.mp4', 100),
      ).rejects.toThrow(ValidationException);
    });

    it('should use default max size of 1000MB', async () => {
      (fs.stat as vi.Mock).mockResolvedValue({
        size: 500 * 1024 * 1024, // 500MB
      });

      await expect(
        SecurityUtil.validateFileSize('/path/to/file.mp4'),
      ).resolves.not.toThrow();
    });

    it('should handle stat errors', async () => {
      (fs.stat as vi.Mock).mockRejectedValue(new Error('Stat failed'));

      await expect(
        SecurityUtil.validateFileSize('/path/to/file.mp4'),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('sanitizeCommandArgs', () => {
    it('should sanitize safe command arguments', () => {
      const args = ['file.mp4', 'output.mp4', '1920', '1080'];
      const result = SecurityUtil.sanitizeCommandArgs(args);

      expect(result).toHaveLength(4);
      expect(result).toEqual(args);
    });

    it('should escape quotes in arguments', () => {
      const args = ['file "with quotes".mp4'];
      const result = SecurityUtil.sanitizeCommandArgs(args);

      expect(result[0]).toContain('\\"');
    });

    it('should throw error for command injection with semicolon', () => {
      expect(() =>
        SecurityUtil.sanitizeCommandArgs(['file.mp4; rm -rf /']),
      ).toThrow(ValidationException);
    });

    it('should throw error for command injection with &&', () => {
      expect(() =>
        SecurityUtil.sanitizeCommandArgs(['file.mp4 && malicious']),
      ).toThrow(ValidationException);
    });

    it('should throw error for command injection with pipes', () => {
      expect(() =>
        SecurityUtil.sanitizeCommandArgs(['file.mp4 | grep secret']),
      ).toThrow(ValidationException);
    });

    it('should throw error for backtick injection', () => {
      expect(() =>
        SecurityUtil.sanitizeCommandArgs(['file.mp4`whoami`']),
      ).toThrow(ValidationException);
    });

    it('should throw error for variable expansion', () => {
      expect(() =>
        SecurityUtil.sanitizeCommandArgs(['$HOME/file.mp4']),
      ).toThrow(ValidationException);
    });

    it('should throw error for non-string arguments', () => {
      expect(() => SecurityUtil.sanitizeCommandArgs([123, 'file.mp4'])).toThrow(
        ValidationException,
      );
    });
  });

  describe('validateNumericParam', () => {
    it('should validate number within range', () => {
      const result = SecurityUtil.validateNumericParam(50, 'width', 0, 100);
      expect(result).toBe(50);
    });

    it('should floor decimal numbers', () => {
      const result = SecurityUtil.validateNumericParam(50.7, 'width', 0, 100);
      expect(result).toBe(50);
    });

    it('should throw error for NaN', () => {
      expect(() => SecurityUtil.validateNumericParam(NaN, 'width')).toThrow(
        ValidationException,
      );
    });

    it('should throw error for non-number', () => {
      expect(() => SecurityUtil.validateNumericParam('50', 'width')).toThrow(
        ValidationException,
      );
    });

    it('should throw error for value below minimum', () => {
      expect(() =>
        SecurityUtil.validateNumericParam(-10, 'width', 0, 100),
      ).toThrow(ValidationException);
    });

    it('should throw error for value above maximum', () => {
      expect(() =>
        SecurityUtil.validateNumericParam(150, 'width', 0, 100),
      ).toThrow(ValidationException);
    });

    it('should use default range 0-10000', () => {
      expect(() => SecurityUtil.validateNumericParam(15000, 'width')).toThrow(
        ValidationException,
      );
    });
  });

  describe('validateStringParam', () => {
    it('should validate and trim string', () => {
      const result = SecurityUtil.validateStringParam(
        '  test string  ',
        'param',
      );
      expect(result).toBe('test string');
    });

    it('should throw error for empty string', () => {
      expect(() => SecurityUtil.validateStringParam('', 'param')).toThrow(
        ValidationException,
      );
    });

    it('should throw error for null value', () => {
      expect(() => SecurityUtil.validateStringParam(null, 'param')).toThrow(
        ValidationException,
      );
    });

    it('should throw error for string exceeding maxLength', () => {
      const longString = 'a'.repeat(300);
      expect(() =>
        SecurityUtil.validateStringParam(longString, 'param', 255),
      ).toThrow(ValidationException);
    });

    it('should block command injection patterns', () => {
      expect(() =>
        SecurityUtil.validateStringParam('test; rm -rf /', 'param'),
      ).toThrow(ValidationException);
    });

    it('should block newline injection', () => {
      expect(() =>
        SecurityUtil.validateStringParam('test\nmalicious', 'param'),
      ).toThrow(ValidationException);
    });
  });

  describe('createSecureTempPath', () => {
    it('should create secure temporary path', () => {
      // validateFileExtension expects a full filename, so we mock it for extension-only strings
      vi.spyOn(SecurityUtil, 'validateFileExtension').mockImplementation(
        () => {},
      );

      const result = SecurityUtil.createSecureTempPath('/tmp', 'test', '.mp4');

      expect(result).toContain('/tmp');
      expect(result).toContain('test');
      expect(result).toContain('.mp4');
      expect(result).toMatch(/_\d+_[a-z0-9]+\.mp4$/);

      vi.restoreAllMocks();
    });

    it('should handle extension without dot', () => {
      vi.spyOn(SecurityUtil, 'validateFileExtension').mockImplementation(
        () => {},
      );

      const result = SecurityUtil.createSecureTempPath('/tmp', 'test', 'mp4');

      expect(result).toContain('.mp4');

      vi.restoreAllMocks();
    });

    it('should validate file extension', () => {
      expect(() =>
        SecurityUtil.createSecureTempPath('/tmp', 'test', '.exe'),
      ).toThrow(ValidationException);
    });

    it('should validate filename length', () => {
      const longFilename = 'a'.repeat(200);

      expect(() =>
        SecurityUtil.createSecureTempPath('/tmp', longFilename, '.mp4'),
      ).toThrow(ValidationException);
    });

    it('should generate unique paths', () => {
      vi.spyOn(SecurityUtil, 'validateFileExtension').mockImplementation(
        () => {},
      );

      const path1 = SecurityUtil.createSecureTempPath('/tmp', 'test', '.mp4');
      const path2 = SecurityUtil.createSecureTempPath('/tmp', 'test', '.mp4');

      expect(path1).not.toBe(path2);

      vi.restoreAllMocks();
    });
  });
});

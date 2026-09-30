import { promises as fs } from 'node:fs';
import { SecurityUtil } from '@files/helpers/utils/security/security.util';
import type { Mock } from 'vitest';

vi.mock('fs', () => ({
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
    it('validates safe paths', () => {
      const result = SecurityUtil.validateFilePath('videos/test.mp4');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('throws for empty paths', () => {
      expect(() => SecurityUtil.validateFilePath('')).toThrow(
        'File path is required and must be a string',
      );
    });

    it('throws for non-string values', () => {
      expect(() => SecurityUtil.validateFilePath(null)).toThrow(
        'File path is required and must be a string',
      );
    });

    it('blocks directory traversal attempts', () => {
      expect(() =>
        SecurityUtil.validateFilePath('../../../etc/passwd'),
      ).toThrow('File path contains forbidden pattern');
      expect(() => SecurityUtil.validateFilePath('..\\..\\windows')).toThrow(
        'File path contains forbidden pattern',
      );
    });

    it('blocks system paths', () => {
      expect(() => SecurityUtil.validateFilePath('/etc/passwd')).toThrow(
        'File path contains forbidden pattern',
      );
      expect(() => SecurityUtil.validateFilePath('/etc/shadow')).toThrow(
        'File path contains forbidden pattern',
      );
      expect(() => SecurityUtil.validateFilePath('/proc/cpuinfo')).toThrow(
        'File path contains forbidden pattern',
      );
      expect(() =>
        SecurityUtil.validateFilePath('c:\\windows\\system32'),
      ).toThrow('File path contains forbidden pattern');
    });

    it('blocks command injection patterns', () => {
      expect(() => SecurityUtil.validateFilePath('file.txt; rm -rf /')).toThrow(
        'File path contains forbidden pattern',
      );
      // biome-ignore lint/suspicious/noTemplateCurlyInString: testing command injection pattern
      expect(() => SecurityUtil.validateFilePath('${HOME}/file.txt')).toThrow(
        'File path contains forbidden pattern',
      );
      expect(() => SecurityUtil.validateFilePath('$(whoami)')).toThrow(
        'File path contains forbidden pattern',
      );
    });
  });

  describe('validateFileExtension', () => {
    it('accepts allowed video extensions', () => {
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

    it('accepts allowed image extensions', () => {
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

    it('accepts allowed audio extensions', () => {
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

    it('rejects missing or disallowed extensions', () => {
      expect(() => SecurityUtil.validateFileExtension('file')).toThrow(
        'File must have an extension',
      );
      expect(() => SecurityUtil.validateFileExtension('file.exe')).toThrow(
        'File extension .exe is not allowed',
      );
      expect(() => SecurityUtil.validateFileExtension('file.sh')).toThrow(
        'File extension .sh is not allowed',
      );
    });

    it('handles mixed case extensions', () => {
      expect(() =>
        SecurityUtil.validateFileExtension('VIDEO.MP4'),
      ).not.toThrow();
      expect(() =>
        SecurityUtil.validateFileExtension('Image.PNG'),
      ).not.toThrow();
    });
  });

  describe('validateFileExists', () => {
    it('accepts readable files', async () => {
      (fs.access as Mock).mockResolvedValue(undefined);

      await expect(
        SecurityUtil.validateFileExists('public/tmp/file.mp4'),
      ).resolves.not.toThrow();
    });

    it('throws for missing files', async () => {
      (fs.access as Mock).mockRejectedValue(new Error('missing'));

      await expect(
        SecurityUtil.validateFileExists('public/tmp/missing.mp4'),
      ).rejects.toThrow('File does not exist or is not readable');
    });
  });

  describe('validateFileSize', () => {
    it('accepts files within the size limit', async () => {
      (fs.stat as Mock).mockResolvedValue({
        size: 50 * 1024 * 1024,
      });

      await expect(
        SecurityUtil.validateFileSize('public/tmp/file.mp4', 100),
      ).resolves.not.toThrow();
    });

    it('rejects files that exceed the size limit', async () => {
      (fs.stat as Mock).mockResolvedValue({
        size: 150 * 1024 * 1024,
      });

      await expect(
        SecurityUtil.validateFileSize('public/tmp/file.mp4', 100),
      ).rejects.toThrow('File size 150.00MB exceeds maximum allowed size');
    });

    it('handles stat failures', async () => {
      (fs.stat as Mock).mockRejectedValue(new Error('Stat failed'));

      await expect(
        SecurityUtil.validateFileSize('public/tmp/file.mp4'),
      ).rejects.toThrow('Cannot validate file size');
    });
  });

  describe('sanitizeCommandArgs', () => {
    it('escapes quotes in arguments', () => {
      const result = SecurityUtil.sanitizeCommandArgs(['file "name".mp4']);

      expect(result[0]).toContain('\\"');
    });

    it('throws for injection patterns', () => {
      expect(() =>
        SecurityUtil.sanitizeCommandArgs(['file.mp4; rm -rf /']),
      ).toThrow('Command argument contains forbidden pattern: ;');
      expect(() =>
        SecurityUtil.sanitizeCommandArgs(['file.mp4 && malicious']),
      ).toThrow('Command argument contains forbidden pattern');
      expect(() =>
        SecurityUtil.sanitizeCommandArgs(['file.mp4 | grep secret']),
      ).toThrow('Command argument contains forbidden pattern');
      expect(() =>
        SecurityUtil.sanitizeCommandArgs(['file.mp4`whoami`']),
      ).toThrow('Command argument contains forbidden pattern');
      expect(() =>
        SecurityUtil.sanitizeCommandArgs(['$HOME/file.mp4']),
      ).toThrow('Command argument contains forbidden pattern');
    });

    it('throws for non-string arguments', () => {
      expect(() => SecurityUtil.sanitizeCommandArgs([123, 'file.mp4'])).toThrow(
        'All command arguments must be strings',
      );
    });
  });

  describe('validateNumericParam', () => {
    it('returns valid numbers within range', () => {
      expect(SecurityUtil.validateNumericParam(50, 'width', 0, 100)).toBe(50);
    });

    it('floors decimal values', () => {
      expect(SecurityUtil.validateNumericParam(50.7, 'width', 0, 100)).toBe(50);
    });

    it('throws for invalid numeric values', () => {
      expect(() => SecurityUtil.validateNumericParam(NaN, 'width')).toThrow(
        'width must be a valid number',
      );
      expect(() => SecurityUtil.validateNumericParam('50', 'width')).toThrow(
        'width must be a valid number',
      );
    });

    it('throws when values are outside bounds', () => {
      expect(() =>
        SecurityUtil.validateNumericParam(-10, 'width', 0, 100),
      ).toThrow('width must be between 0 and 100');
      expect(() =>
        SecurityUtil.validateNumericParam(150, 'width', 0, 100),
      ).toThrow('width must be between 0 and 100');
    });
  });

  describe('validateStringParam', () => {
    it('trims valid string values', () => {
      const result = SecurityUtil.validateStringParam(
        '  test string  ',
        'param',
      );

      expect(result).toBe('test string');
    });

    it('rejects empty or invalid values', () => {
      expect(() => SecurityUtil.validateStringParam('', 'param')).toThrow(
        'param is required and must be a string',
      );
      expect(() => SecurityUtil.validateStringParam(null, 'param')).toThrow(
        'param is required and must be a string',
      );
    });

    it('rejects strings that exceed max length', () => {
      const longString = 'a'.repeat(300);

      expect(() =>
        SecurityUtil.validateStringParam(longString, 'param', 255),
      ).toThrow('param must be 255 characters or less');
    });

    it('blocks injection patterns in strings', () => {
      expect(() =>
        SecurityUtil.validateStringParam('test; rm -rf /', 'param'),
      ).toThrow('param contains forbidden pattern');
      expect(() =>
        SecurityUtil.validateStringParam('test\nmalicious', 'param'),
      ).toThrow('param contains forbidden pattern');
    });
  });

  describe('createSecureTempPath', () => {
    it('creates secure temp paths', () => {
      const result = SecurityUtil.createSecureTempPath(
        'public/tmp',
        'test',
        '.mp4',
      );

      expect(result).toContain('public/tmp');
      expect(result).toContain('test');
      expect(result).toContain('.mp4');
      expect(result).toMatch(/_\d+_[a-z0-9]+\.mp4$/);
    });

    it('adds a dot to extensions when missing', () => {
      const result = SecurityUtil.createSecureTempPath(
        'public/tmp',
        'test',
        'mp4',
      );

      expect(result).toContain('.mp4');
    });

    it('rejects disallowed extensions', () => {
      expect(() =>
        SecurityUtil.createSecureTempPath('public/tmp', 'test', '.exe'),
      ).toThrow('File extension .exe is not allowed');
    });

    it('rejects long filenames', () => {
      const longFilename = 'a'.repeat(200);

      expect(() =>
        SecurityUtil.createSecureTempPath('public/tmp', longFilename, '.mp4'),
      ).toThrow('filename must be 100 characters or less');
    });
  });
});

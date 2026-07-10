import { promises as fs } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPathSecurity,
  createPathSecurityClass,
  DEFAULT_ALLOWED_EXTENSIONS,
  DEFAULT_BLOCKED_PATTERNS,
  DEFAULT_INJECTION_PATTERNS,
  type PathSecurity,
} from './path-security';

// Mock node:fs so filesystem probes are deterministic.
vi.mock('node:fs', () => ({
  promises: {
    access: vi.fn(),
    constants: { R_OK: 4 },
    stat: vi.fn(),
  },
}));

/**
 * Distinct error type so tests can prove the injected factory — not a hard-coded
 * class — is what every guard throws. This is the seam that lets `api` throw a
 * NestJS HttpException and `files` throw a plain Error from one implementation.
 */
class TestSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestSecurityError';
  }
}

const createError = (message: string) => new TestSecurityError(message);

describe('createPathSecurity', () => {
  let security: PathSecurity;

  beforeEach(() => {
    vi.clearAllMocks();
    security = createPathSecurity({ createError });
  });

  describe('error-factory seam', () => {
    it('throws errors built by the injected factory, not a built-in type', () => {
      expect(() => security.validateFilePath('')).toThrow(TestSecurityError);
    });

    it('lets each consumer choose its own error class independently', () => {
      class OtherError extends Error {}
      const other = createPathSecurity({
        createError: (m) => new OtherError(m),
      });

      expect(() => other.validateFilePath('')).toThrow(OtherError);
      expect(() => other.validateFilePath('')).not.toThrow(TestSecurityError);
    });
  });

  describe('bound class factory', () => {
    it('exposes the configured guards as inherited static methods', () => {
      class SecurityUtil extends createPathSecurityClass({ createError }) {}

      expect(SecurityUtil.validateStringParam('  safe  ', 'value')).toBe(
        'safe',
      );
      expect(() => SecurityUtil.validateFilePath('')).toThrow(
        TestSecurityError,
      );
    });
  });

  describe('validateFilePath — directory traversal', () => {
    it('accepts known-good relative and absolute media paths', () => {
      expect(security.validateFilePath('videos/test.mp4')).toContain(
        'test.mp4',
      );
      expect(security.validateFilePath('/var/data/media/clip.mp4')).toBe(
        path.resolve('/var/data/media/clip.mp4'),
      );
    });

    it('blocks POSIX traversal (../)', () => {
      expect(() => security.validateFilePath('../../../etc/passwd')).toThrow(
        'forbidden pattern',
      );
      expect(() => security.validateFilePath('videos/../../secret')).toThrow(
        'forbidden pattern',
      );
    });

    it('blocks Windows traversal (..\\)', () => {
      expect(() => security.validateFilePath('..\\..\\windows')).toThrow(
        'forbidden pattern',
      );
    });

    it('blocks traversal regardless of case', () => {
      expect(() => security.validateFilePath('/ETC/PASSWD')).toThrow(
        'forbidden pattern',
      );
      expect(() => security.validateFilePath('C:\\Windows\\System32')).toThrow(
        'forbidden pattern',
      );
    });

    it('documents that URL-encoded traversal is NOT decoded (current contract)', () => {
      // The guard matches literal patterns only; it does not URL-decode. An
      // encoded sequence has no literal "../" so it passes this layer and is
      // handed to path.normalize/resolve unchanged. Encode-then-decode defense
      // is intentionally out of scope for this behavior-preserving extraction.
      const encoded = '..%2f..%2fetc%2fpasswd';
      expect(() => security.validateFilePath(encoded)).not.toThrow();
      expect(security.validateFilePath(encoded)).toBe(path.resolve(encoded));
    });
  });

  describe('validateFilePath — absolute system-path boundaries', () => {
    it.each([
      '/etc/passwd',
      '/etc/shadow',
      '/proc/cpuinfo',
      '/sys/kernel',
      'c:\\boot.ini',
      'd:\\data',
      '\\windows\\system32',
      '\\program files\\app',
    ])('blocks access to %s', (badPath) => {
      expect(() => security.validateFilePath(badPath)).toThrow(
        'forbidden pattern',
      );
    });

    it.each([
      '~/secrets',
      '$HOME/file',
      '%USERPROFILE%\\x',
    ])('blocks home/env expansion in %s', (badPath) => {
      expect(() => security.validateFilePath(badPath)).toThrow(
        'forbidden pattern',
      );
    });

    it.each([
      // biome-ignore lint/suspicious/noTemplateCurlyInString: testing shell expansion pattern
      '${HOME}/file.txt',
      '$(whoami)',
      'file`whoami`.mp4',
    ])('blocks shell expansion metacharacters in %s', (badPath) => {
      expect(() => security.validateFilePath(badPath)).toThrow(
        'forbidden pattern',
      );
    });
  });

  describe('validateFilePath — input validation', () => {
    it('rejects empty and non-string input', () => {
      expect(() => security.validateFilePath('')).toThrow('required');
      expect(() =>
        security.validateFilePath(null as unknown as string),
      ).toThrow('required');
      expect(() =>
        security.validateFilePath(undefined as unknown as string),
      ).toThrow('required');
    });
  });

  describe('configurable blocked patterns (api vs files divergence)', () => {
    it('does not block ";" in paths by default (api behavior)', () => {
      // A semicolon alone is a legal POSIX filename character; the default set
      // leaves it to sanitizeCommandArgs / validateStringParam.
      expect(() => security.validateFilePath('videos/a;b.mp4')).not.toThrow();
    });

    it('blocks ";" when a consumer adds it (files behavior)', () => {
      const strict = createPathSecurity({
        createError,
        blockedPatterns: [...DEFAULT_BLOCKED_PATTERNS, ';'],
      });
      expect(() => strict.validateFilePath('file.txt; rm -rf /')).toThrow(
        'forbidden pattern',
      );
    });
  });

  describe('validateFileExtension', () => {
    it.each([
      'video.mp4',
      'video.MOV',
      'image.png',
      'audio.mp3',
      'x.webp',
    ])('accepts allowed extension in %s', (name) => {
      expect(() => security.validateFileExtension(name)).not.toThrow();
    });

    it('rejects a file with no extension', () => {
      expect(() => security.validateFileExtension('file')).toThrow(
        'File must have an extension',
      );
    });

    it.each([
      'file.exe',
      'file.sh',
      'file.bat',
      'file.php',
    ])('rejects disallowed extension %s', (name) => {
      expect(() => security.validateFileExtension(name)).toThrow(
        'is not allowed',
      );
    });

    it('honors a custom allowed-extension list', () => {
      const restricted = createPathSecurity({
        createError,
        allowedExtensions: ['.png'],
      });
      expect(() => restricted.validateFileExtension('a.png')).not.toThrow();
      expect(() => restricted.validateFileExtension('a.mp4')).toThrow(
        'is not allowed',
      );
    });
  });

  describe('validateFileExists', () => {
    it('resolves when the file is readable', async () => {
      (fs.access as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined,
      );
      await expect(
        security.validateFileExists('/tmp/file.mp4'),
      ).resolves.toBeUndefined();
    });

    it('throws when the file is missing or unreadable', async () => {
      (fs.access as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('nope'),
      );
      await expect(
        security.validateFileExists('/tmp/missing.mp4'),
      ).rejects.toThrow('does not exist or is not readable');
    });
  });

  describe('validateFileSize', () => {
    it('resolves for files within the limit', async () => {
      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        size: 50 * 1024 * 1024,
      });
      await expect(
        security.validateFileSize('/tmp/file.mp4', 100),
      ).resolves.toBeUndefined();
    });

    it('throws when a file exceeds the limit', async () => {
      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        size: 150 * 1024 * 1024,
      });
      await expect(
        security.validateFileSize('/tmp/big.mp4', 100),
      ).rejects.toThrow('exceeds maximum allowed size of 100MB');
    });

    it('defaults to a 1000MB ceiling', async () => {
      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        size: 500 * 1024 * 1024,
      });
      await expect(
        security.validateFileSize('/tmp/file.mp4'),
      ).resolves.toBeUndefined();
    });

    it('wraps stat failures rather than leaking them', async () => {
      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Stat failed'),
      );
      await expect(security.validateFileSize('/tmp/file.mp4')).rejects.toThrow(
        'Cannot validate file size: Stat failed',
      );
    });
  });

  describe('sanitizeCommandArgs', () => {
    it('passes clean arguments through unchanged', () => {
      const args = ['file.mp4', 'output.mp4', '1920', '1080'];
      expect(security.sanitizeCommandArgs(args)).toEqual(args);
    });

    it('escapes quotes and backslashes', () => {
      expect(security.sanitizeCommandArgs(['a "b" c'])[0]).toContain('\\"');
      expect(security.sanitizeCommandArgs(["a 'b' c"])[0]).toContain("\\'");
    });

    it.each([
      ['semicolon', 'file.mp4; rm -rf /'],
      ['and', 'file.mp4 && malicious'],
      ['or', 'file.mp4 || malicious'],
      ['pipe', 'file.mp4 | grep secret'],
      ['backtick', 'file.mp4`whoami`'],
      ['dollar', '$HOME/file.mp4'],
      ['newline', 'file.mp4\nrm'],
    ])('rejects %s injection', (_label, arg) => {
      expect(() => security.sanitizeCommandArgs([arg])).toThrow(
        'forbidden pattern',
      );
    });

    it('rejects non-string arguments (type check)', () => {
      expect(() =>
        security.sanitizeCommandArgs([123 as unknown as string, 'file.mp4']),
      ).toThrow('must be strings');
    });
  });

  describe('validateNumericParam', () => {
    it('returns integers within range and floors decimals', () => {
      expect(security.validateNumericParam(50, 'width', 0, 100)).toBe(50);
      expect(security.validateNumericParam(50.7, 'width', 0, 100)).toBe(50);
    });

    it('rejects NaN and non-numbers', () => {
      expect(() => security.validateNumericParam(Number.NaN, 'w')).toThrow(
        'valid number',
      );
      expect(() =>
        security.validateNumericParam('50' as unknown as number, 'w'),
      ).toThrow('valid number');
    });

    it('rejects out-of-range values', () => {
      expect(() => security.validateNumericParam(-1, 'w', 0, 100)).toThrow(
        'between 0 and 100',
      );
      expect(() => security.validateNumericParam(150, 'w', 0, 100)).toThrow(
        'between 0 and 100',
      );
      expect(() => security.validateNumericParam(15000, 'w')).toThrow(
        'between 0 and 10000',
      );
    });
  });

  describe('validateStringParam', () => {
    it('trims and returns valid strings', () => {
      expect(security.validateStringParam('  hi  ', 'p')).toBe('hi');
    });

    it('rejects empty, null, and over-long values', () => {
      expect(() => security.validateStringParam('', 'p')).toThrow('required');
      expect(() =>
        security.validateStringParam(null as unknown as string, 'p'),
      ).toThrow('required');
      expect(() =>
        security.validateStringParam('a'.repeat(300), 'p', 255),
      ).toThrow('255 characters or less');
    });

    it('blocks injection patterns in string params', () => {
      expect(() => security.validateStringParam('a; rm -rf /', 'p')).toThrow(
        'forbidden pattern',
      );
      expect(() => security.validateStringParam('a\nb', 'p')).toThrow(
        'forbidden pattern',
      );
    });
  });

  describe('createSecureTempPath', () => {
    it('builds a unique path under the base dir for a valid extension', () => {
      const result = security.createSecureTempPath('/tmp', 'clip', '.mp4');
      expect(result).toContain(`${path.sep}tmp${path.sep}`);
      expect(result).toContain('clip');
      expect(result).toMatch(/_\d+_[a-z0-9]+\.mp4$/);
    });

    it('normalizes an extension supplied without a leading dot', () => {
      expect(security.createSecureTempPath('/tmp', 'clip', 'mp4')).toMatch(
        /\.mp4$/,
      );
    });

    it('validates the extension against the allow-list (regression: was a latent no-op)', () => {
      // Guards the api-copy bug where extname('.mp4') === '' made this throw for
      // EVERY valid extension. The shared form validates `file<ext>` so a real
      // disallowed extension is what actually gets rejected.
      expect(() =>
        security.createSecureTempPath('/tmp', 'clip', '.exe'),
      ).toThrow('is not allowed');
    });

    it('rejects over-long filenames before touching the extension', () => {
      expect(() =>
        security.createSecureTempPath('/tmp', 'a'.repeat(200), '.mp4'),
      ).toThrow('100 characters or less');
    });

    it.each([
      '../clip',
      '..\\clip',
      'nested/clip',
      'nested\\clip',
    ])('rejects filename path components: %s', (filename) => {
      expect(() =>
        security.createSecureTempPath('/tmp', filename, '.mp4'),
      ).toThrow('filename must be a single path component');
    });

    it.each([
      '../../mp4',
      '/../../evil.mp4',
      '.mp4/../../evil',
    ])('rejects extension path components: %s', (extension) => {
      expect(() =>
        security.createSecureTempPath('/tmp', 'clip', extension),
      ).toThrow('extension must be a single file extension');
    });

    it('generates a fresh path on every call', () => {
      const a = security.createSecureTempPath('/tmp', 'clip', '.mp4');
      const b = security.createSecureTempPath('/tmp', 'clip', '.mp4');
      expect(a).not.toBe(b);
    });
  });

  describe('exported default pattern sets', () => {
    it('ships the media allow-list and traversal/injection guards', () => {
      expect(DEFAULT_ALLOWED_EXTENSIONS).toContain('.mp4');
      expect(DEFAULT_BLOCKED_PATTERNS).toContain('../');
      expect(DEFAULT_BLOCKED_PATTERNS).not.toContain(';'); // api default
      expect(DEFAULT_INJECTION_PATTERNS).toContain(';');
    });
  });
});

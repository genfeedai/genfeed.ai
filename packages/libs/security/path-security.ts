import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Shared, framework-agnostic path-traversal and command-injection sanitization.
 *
 * Extracted verbatim (behavior-preserving) from the byte-compatible copies that
 * lived in `apps/server/api` and `apps/server/files` (DRY audit §2.C3c / §5.S1).
 * The two copies threw different exception types — the api copy a NestJS
 * `HttpException`, the files copy a plain `Error` — so the thrown error is
 * injected via {@link PathSecurityOptions.createError} instead of hard-coded
 * here. That keeps this module free of any NestJS / app dependency and safe to
 * import from any server workspace.
 *
 * NOTE: LLM prompt-injection sanitization (`sanitizePromptInput*`) intentionally
 * does NOT live here — it is API-local, since only the API builds LLM prompts.
 */

/** Factory that turns a message into the consumer's validation error type. */
export type SecurityErrorFactory = (message: string) => Error;

/** Allowed media file extensions (lowercased, dot-prefixed). */
export const DEFAULT_ALLOWED_EXTENSIONS: readonly string[] = [
  '.mp4',
  '.avi',
  '.mov',
  '.mkv',
  '.webm',
  '.flv',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.mp3',
  '.wav',
  '.aac',
  '.flac',
  '.ogg',
  '.m4a',
];

/**
 * Path substrings that indicate directory traversal or access to sensitive
 * system locations. `;` is deliberately NOT included here — a semicolon is a
 * legal POSIX filename character, and command-level metacharacters are handled
 * by {@link DEFAULT_INJECTION_PATTERNS}. Consumers that also want to reject `;`
 * in paths (the `files` service historically did) pass their own
 * `blockedPatterns` extending this set.
 */
export const DEFAULT_BLOCKED_PATTERNS: readonly string[] = [
  '../',
  '..\\',
  '/etc/passwd',
  '/etc/shadow',
  '/proc/',
  '/sys/',
  'c:\\',
  'd:\\',
  '\\windows\\',
  '\\program files\\',
  '~/',
  '$HOME',
  '%USERPROFILE%',
  '${',
  '$(',
  '`',
];

/** Substrings that indicate shell command injection. */
export const DEFAULT_INJECTION_PATTERNS: readonly string[] = [
  ';',
  '&&',
  '||',
  '|',
  '`',
  '$',
  '$(',
  '${',
  '\n',
  '\r',
  '\0',
  '&gt;',
  '&lt;',
  '&amp;',
];

export interface PathSecurityOptions {
  /** Required: builds the error thrown by every guard. */
  createError: SecurityErrorFactory;
  /** Override the allowed media extensions. Defaults to {@link DEFAULT_ALLOWED_EXTENSIONS}. */
  allowedExtensions?: readonly string[];
  /** Override the blocked path patterns. Defaults to {@link DEFAULT_BLOCKED_PATTERNS}. */
  blockedPatterns?: readonly string[];
  /** Override the command-injection patterns. Defaults to {@link DEFAULT_INJECTION_PATTERNS}. */
  injectionPatterns?: readonly string[];
}

export interface PathSecurity {
  /** Validate + normalize a file path, blocking directory traversal. */
  validateFilePath(filePath: string): string;
  /** Assert a file's extension is in the allow-list. */
  validateFileExtension(filePath: string): void;
  /** Assert a file exists and is readable. */
  validateFileExists(filePath: string): Promise<void>;
  /** Assert a file's size is within `maxSizeMB` (default 1000). */
  validateFileSize(filePath: string, maxSizeMB?: number): Promise<void>;
  /** Reject command args containing injection patterns; escape shell-unsafe chars. */
  sanitizeCommandArgs(args: string[]): string[];
  /** Validate a numeric param is a finite integer within `[min, max]`. */
  validateNumericParam(
    value: number,
    name: string,
    min?: number,
    max?: number,
  ): number;
  /** Validate + trim a string param, rejecting injection patterns. */
  validateStringParam(value: string, name: string, maxLength?: number): string;
  /** Build a unique, extension-validated temp path under `baseDir`. */
  createSecureTempPath(
    baseDir: string,
    filename: string,
    extension: string,
  ): string;
}

/**
 * Build a {@link PathSecurity} bound to a consumer's error type and pattern sets.
 */
export function createPathSecurity(options: PathSecurityOptions): PathSecurity {
  const { createError } = options;
  const allowedExtensions =
    options.allowedExtensions ?? DEFAULT_ALLOWED_EXTENSIONS;
  const blockedPatterns = options.blockedPatterns ?? DEFAULT_BLOCKED_PATTERNS;
  const injectionPatterns =
    options.injectionPatterns ?? DEFAULT_INJECTION_PATTERNS;

  function validateFileExtension(filePath: string): void {
    const extension = path.extname(filePath).toLowerCase();

    if (!extension) {
      throw createError('File must have an extension');
    }

    if (!allowedExtensions.includes(extension)) {
      throw createError(
        `File extension ${extension} is not allowed. Allowed extensions: ${allowedExtensions.join(',')}`,
      );
    }
  }

  function validateStringParam(
    value: string,
    name: string,
    maxLength = 255,
  ): string {
    if (!value || typeof value !== 'string') {
      throw createError(`${name} is required and must be a string`);
    }

    if (value.length > maxLength) {
      throw createError(`${name} must be ${maxLength} characters or less`);
    }

    for (const pattern of injectionPatterns) {
      if (value.includes(pattern)) {
        throw createError(`${name} contains forbidden pattern: ${pattern}`);
      }
    }

    return value.trim();
  }

  return {
    validateFilePath(filePath: string): string {
      if (!filePath || typeof filePath !== 'string') {
        throw createError('File path is required and must be a string');
      }

      // Check for blocked patterns first (security check)
      const lowerPath = filePath.toLowerCase();
      for (const pattern of blockedPatterns) {
        if (lowerPath.includes(pattern.toLowerCase())) {
          throw createError(`File path contains forbidden pattern: ${pattern}`);
        }
      }

      // Normalize and resolve path after security checks
      const normalizedPath = path.normalize(filePath);
      return path.resolve(normalizedPath);
    },

    validateFileExtension,

    async validateFileExists(filePath: string): Promise<void> {
      try {
        await fs.access(filePath, fs.constants.R_OK);
      } catch {
        throw createError(
          `File does not exist or is not readable: ${filePath}`,
        );
      }
    },

    async validateFileSize(filePath: string, maxSizeMB = 1000): Promise<void> {
      let stats: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stats = await fs.stat(filePath);
      } catch (error: unknown) {
        const errorMessage = (error as Error)?.message ?? 'Unknown error';
        throw createError(`Cannot validate file size: ${errorMessage}`);
      }

      const fileSizeMB = stats.size / (1024 * 1024);
      if (fileSizeMB > maxSizeMB) {
        throw createError(
          `File size ${fileSizeMB.toFixed(2)}MB exceeds maximum allowed size of ${maxSizeMB}MB`,
        );
      }
    },

    sanitizeCommandArgs(args: string[]): string[] {
      return args.map((arg) => {
        if (typeof arg !== 'string') {
          throw createError('All command arguments must be strings');
        }

        for (const pattern of injectionPatterns) {
          if (arg.includes(pattern)) {
            throw createError(
              `Command argument contains forbidden pattern: ${pattern}`,
            );
          }
        }

        // Additional escaping for shell-unsafe characters
        return arg.replace(/['"\\]/g, '\\$&');
      });
    },

    validateNumericParam(
      value: number,
      name: string,
      min = 0,
      max = 10000,
    ): number {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw createError(`${name} must be a valid number`);
      }

      if (value < min || value > max) {
        throw createError(`${name} must be between ${min} and ${max}`);
      }

      return Math.floor(value); // Ensure integer
    },

    validateStringParam,

    createSecureTempPath(
      baseDir: string,
      filename: string,
      extension: string,
    ): string {
      // Validate inputs
      const safeFilename = validateStringParam(filename, 'filename', 100);
      const safeExtension = extension.startsWith('.')
        ? extension
        : `.${extension}`;

      // Prefix with a stub filename so path.extname sees a real extension —
      // extname('.mp4') === '' (dotfile), which would otherwise reject every
      // valid extension.
      validateFileExtension(`file${safeExtension}`);

      // Generate secure path
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const secureFilename = `${safeFilename}_${timestamp}_${random}${safeExtension}`;

      return path.join(baseDir, secureFilename);
    },
  };
}

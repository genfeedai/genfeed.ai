import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ValidationException } from '@files/helpers/exceptions/validation.exception';

/**
 * Security utilities for input validation and sanitization
 */
export class SecurityUtil {
  // Allowed file extensions for media processing
  private static readonly ALLOWED_EXTENSIONS = [
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

  // Blocked path patterns to prevent directory traversal and command injection
  private static readonly BLOCKED_PATTERNS = [
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
    ';',
  ];

  // Command injection patterns
  private static readonly INJECTION_PATTERNS = [
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

  /**
   * Validate and sanitize file path to prevent directory traversal
   */
  static validateFilePath(filePath: string): string {
    if (!filePath || typeof filePath !== 'string') {
      throw new ValidationException(
        'File path is required and must be a string',
      );
    }

    const lowerPath = filePath.toLowerCase();
    for (const pattern of SecurityUtil.BLOCKED_PATTERNS) {
      if (lowerPath.includes(pattern.toLowerCase())) {
        throw new ValidationException(
          `File path contains forbidden pattern: ${pattern}`,
        );
      }
    }

    // Normalize and resolve path after security checks
    const normalizedPath = path.normalize(filePath);
    const resolvedPath = path.resolve(normalizedPath);

    return resolvedPath;
  }

  /**
   * Validate file extension against allowed list
   */
  static validateFileExtension(filePath: string): void {
    const extension = path.extname(filePath).toLowerCase();

    if (!extension) {
      throw new ValidationException('File must have an extension');
    }

    if (!SecurityUtil.ALLOWED_EXTENSIONS.includes(extension)) {
      throw new ValidationException(
        `File extension ${extension} is not allowed. Allowed extensions: ${SecurityUtil.ALLOWED_EXTENSIONS.join(',')}`,
      );
    }
  }

  /**
   * Check if file exists and is readable
   */
  static async validateFileExists(filePath: string): Promise<void> {
    try {
      await fs.access(filePath, fs.constants.R_OK);
    } catch {
      throw new ValidationException(
        `File does not exist or is not readable: ${filePath}`,
      );
    }
  }

  /**
   * Validate file size is within reasonable limits
   */
  static async validateFileSize(
    filePath: string,
    maxSizeMB: number = 1000,
  ): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      const fileSizeMB = stats.size / (1024 * 1024);

      if (fileSizeMB > maxSizeMB) {
        throw new ValidationException(
          `File size ${fileSizeMB.toFixed(2)}MB exceeds maximum allowed size of ${maxSizeMB}MB`,
        );
      }
    } catch (error: unknown) {
      if (error instanceof ValidationException) {
        throw error;
      }
      const errorMessage = (error as Error)?.message ?? 'Unknown error';
      throw new ValidationException(
        `Cannot validate file size: ${errorMessage}`,
      );
    }
  }

  /**
   * Sanitize command arguments to prevent injection
   */
  static sanitizeCommandArgs(args: string[]): string[] {
    return args.map((arg) => {
      if (typeof arg !== 'string') {
        throw new ValidationException('All command arguments must be strings');
      }

      for (const pattern of SecurityUtil.INJECTION_PATTERNS) {
        if (arg.includes(pattern)) {
          throw new ValidationException(
            `Command argument contains forbidden pattern: ${pattern}`,
          );
        }
      }

      // Additional escaping for shell-unsafe characters
      return arg.replace(/['"\\]/g, '\\$&');
    });
  }

  /**
   * Validate numeric parameters are within safe ranges
   */
  static validateNumericParam(
    value: number,
    name: string,
    min: number = 0,
    max: number = 10000,
  ): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new ValidationException(`${name} must be a valid number`);
    }

    if (value < min || value > max) {
      throw new ValidationException(
        `${name} must be between ${min} and ${max}`,
      );
    }

    return Math.floor(value); // Ensure integer
  }

  /**
   * Validate string parameters
   */
  static validateStringParam(
    value: string,
    name: string,
    maxLength: number = 255,
  ): string {
    if (!value || typeof value !== 'string') {
      throw new ValidationException(`${name} is required and must be a string`);
    }

    if (value.length > maxLength) {
      throw new ValidationException(
        `${name} must be ${maxLength} characters or less`,
      );
    }

    for (const pattern of SecurityUtil.INJECTION_PATTERNS) {
      if (value.includes(pattern)) {
        throw new ValidationException(
          `${name} contains forbidden pattern: ${pattern}`,
        );
      }
    }

    return value.trim();
  }

  /**
   * Create secure temporary file path
   */
  static createSecureTempPath(
    baseDir: string,
    filename: string,
    extension: string,
  ): string {
    // Validate inputs
    const safeFilename = SecurityUtil.validateStringParam(
      filename,
      'filename',
      100,
    );
    const safeExtension = extension.startsWith('.')
      ? extension
      : `.${extension}`;

    SecurityUtil.validateFileExtension(`file${safeExtension}`);

    // Generate secure path
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const secureFilename = `${safeFilename}_${timestamp}_${random}${safeExtension}`;

    return path.join(baseDir, secureFilename);
  }
}

import { ValidationException } from '@files/helpers/exceptions/validation.exception';
import { createPathSecurity, DEFAULT_BLOCKED_PATTERNS } from '@libs/security';

/**
 * Path-traversal / command-injection sanitization is shared with the `api`
 * service via `@libs/security`; the shared guards throw this service's plain
 * `ValidationException` via the injected error factory.
 *
 * The `files` service additionally blocks `;` in file paths (media-processing
 * paths are handed to ffmpeg), so it extends the shared blocked-pattern set.
 */
const pathSecurity = createPathSecurity({
  createError: (message) => new ValidationException(message),
  blockedPatterns: [...DEFAULT_BLOCKED_PATTERNS, ';'],
});

/**
 * Security utilities for input validation and sanitization
 */
export class SecurityUtil {
  /**
   * Validate and sanitize file path to prevent directory traversal
   */
  static validateFilePath(filePath: string): string {
    return pathSecurity.validateFilePath(filePath);
  }

  /**
   * Validate file extension against allowed list
   */
  static validateFileExtension(filePath: string): void {
    pathSecurity.validateFileExtension(filePath);
  }

  /**
   * Check if file exists and is readable
   */
  static validateFileExists(filePath: string): Promise<void> {
    return pathSecurity.validateFileExists(filePath);
  }

  /**
   * Validate file size is within reasonable limits
   */
  static validateFileSize(filePath: string, maxSizeMB = 1000): Promise<void> {
    return pathSecurity.validateFileSize(filePath, maxSizeMB);
  }

  /**
   * Sanitize command arguments to prevent injection
   */
  static sanitizeCommandArgs(args: string[]): string[] {
    return pathSecurity.sanitizeCommandArgs(args);
  }

  /**
   * Validate numeric parameters are within safe ranges
   */
  static validateNumericParam(
    value: number,
    name: string,
    min = 0,
    max = 10000,
  ): number {
    return pathSecurity.validateNumericParam(value, name, min, max);
  }

  /**
   * Validate string parameters
   */
  static validateStringParam(
    value: string,
    name: string,
    maxLength = 255,
  ): string {
    return pathSecurity.validateStringParam(value, name, maxLength);
  }

  /**
   * Create secure temporary file path
   */
  static createSecureTempPath(
    baseDir: string,
    filename: string,
    extension: string,
  ): string {
    return pathSecurity.createSecureTempPath(baseDir, filename, extension);
  }
}

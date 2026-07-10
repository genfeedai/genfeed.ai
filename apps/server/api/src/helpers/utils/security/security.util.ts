import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { createPathSecurity } from '@libs/security';

/**
 * Path-traversal / command-injection sanitization is shared with the `files`
 * service via `@libs/security`; the shared guards throw this app's NestJS
 * `ValidationException` (422) via the injected error factory. Prompt-injection
 * sanitization below stays API-local — only the API builds LLM prompts.
 */
const pathSecurity = createPathSecurity({
  createError: (message) => new ValidationException(message),
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

  /**
   * Common prompt injection patterns to detect and sanitize.
   * Role markers (system:, user:, etc.) only match at line start to avoid false positives.
   */
  private static readonly PROMPT_INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?previous\s+instructions?/gi,
    /disregard\s+(all\s+)?previous\s+instructions?/gi,
    /forget\s+(all\s+)?previous\s+instructions?/gi,
    /ignore\s+(the\s+)?above/gi,
    /new\s+instructions?:/gi,
    // Role markers - only match at start of line to avoid false positives like "contact user:"
    /^system\s*:/gim,
    /^assistant\s*:/gim,
    /^human\s*:/gim,
    /^user\s*:/gim,
    // XML-style role tags
    /<\/?system>/gi,
    /<\/?assistant>/gi,
    /<\/?human>/gi,
    /\[\[.*?\]\]/g, // Double brackets
    /\{\{.*?\}\}/g, // Double braces (template injection)
  ];

  /**
   * Sanitize user input for safe interpolation into LLM prompts.
   * Removes control characters, limits length, and detects injection patterns.
   *
   * @param input - User-provided text to sanitize
   * @param maxLength - Maximum allowed length (default: 2000)
   * @returns Sanitized input safe for prompt interpolation
   */
  static sanitizePromptInput(input: string, maxLength: number = 2000): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    let sanitized = input;

    // Remove control characters except newlines and tabs
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching control characters for security sanitization
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Remove/escape prompt injection patterns
    for (const pattern of SecurityUtil.PROMPT_INJECTION_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REMOVED]');
    }

    // Escape backticks (used in some LLM prompt attacks)
    sanitized = sanitized.replace(/`/g, "'");

    // Limit length
    if (sanitized.length > maxLength) {
      sanitized = `${sanitized.slice(0, maxLength)}...`;
    }

    return sanitized.trim();
  }

  /**
   * Sanitize an array of user inputs for prompt interpolation
   */
  static sanitizePromptInputArray(
    inputs: string[],
    maxLengthPerItem: number = 500,
  ): string[] {
    if (!Array.isArray(inputs)) {
      return [];
    }
    return inputs
      .filter((item) => typeof item === 'string')
      .map((item) => SecurityUtil.sanitizePromptInput(item, maxLengthPerItem));
  }
}

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';

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

  // Blocked path patterns to prevent directory traversal
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

    // Check for blocked patterns first (security check)
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

      // Check for injection patterns
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

    // Check for injection patterns in string params
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

    SecurityUtil.validateFileExtension(safeExtension);

    // Generate secure path
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const secureFilename = `${safeFilename}_${timestamp}_${random}${safeExtension}`;

    return path.join(baseDir, secureFilename);
  }
}

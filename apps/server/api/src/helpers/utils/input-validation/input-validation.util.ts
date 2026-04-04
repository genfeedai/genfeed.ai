import { ValidationConfigService } from '@api/config/services/validation.config';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';

/**
 * Comprehensive input validation utility
 */
export class InputValidationUtil {
  // Common dangerous patterns in user input
  private static readonly DANGEROUS_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /onclick\s*=/gi,
    /onfocus\s*=/gi,
    /onmouseover\s*=/gi,
    /<iframe\b/gi,
    /<object\b/gi,
    /<embed\b/gi,
    /<link\b/gi,
    /<meta\b/gi,
    /<style\b/gi,
  ];

  // SQL injection patterns
  private static readonly SQL_INJECTION_PATTERNS = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(UNION\s+SELECT)/gi,
    /(\bOR\s+\d+\s*=\s*\d+)/gi,
    /(\bOR\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?)/gi,
    /(\bAND\s+\d+\s*=\s*\d+)/gi,
    /(--\s)/g,
    /(\/\*.*\*\/)/g,
    /(\bxp_cmdshell\b)/gi,
    /(\bsp_executesql\b)/gi,
  ];

  // NoSQL injection patterns
  private static readonly NOSQL_INJECTION_PATTERNS = [
    /\$where/gi,
    /\$regex/gi,
    /\$ne/gi,
    /\$nin/gi,
    /\$or/gi,
    /\$and/gi,
    /\$nor/gi,
    /\$exists/gi,
    /\$type/gi,
    /\$expr/gi,
    /\$jsonSchema/gi,
    /\$mod/gi,
    /\$size/gi,
    /\$all/gi,
    /\$elemMatch/gi,
  ];

  /**
   * Validate and sanitize string input
   */
  static validateString(
    value: unknown,
    fieldName: string,
    options: {
      required?: boolean;
      minLength?: number;
      maxLength?: number;
      allowEmpty?: boolean;
      pattern?: RegExp;
      sanitize?: boolean;
    } = {},
  ): string {
    const {
      required = true,
      minLength = 0,
      maxLength = 1000,
      allowEmpty = false,
      pattern,
      sanitize = true,
    } = options;

    if (value === null || value === undefined) {
      if (required) {
        throw new ValidationException(`${fieldName} is required`);
      }
      return '';
    }

    if (typeof value !== 'string') {
      throw new ValidationException(`${fieldName} must be a string`);
    }

    const trimmed = value.trim();

    if (!allowEmpty && trimmed.length === 0 && required) {
      throw new ValidationException(`${fieldName} cannot be empty`);
    }

    if (trimmed.length < minLength) {
      throw new ValidationException(
        `${fieldName} must be at least ${minLength} characters long`,
      );
    }

    if (trimmed.length > maxLength) {
      throw new ValidationException(
        `${fieldName} must be no more than ${maxLength} characters long`,
      );
    }

    if (pattern && !pattern.test(trimmed)) {
      throw new ValidationException(`${fieldName} format is invalid`);
    }

    let result = trimmed;

    if (sanitize) {
      result = InputValidationUtil.sanitizeString(result, fieldName);
    }

    return result;
  }

  /**
   * Validate numeric input
   */
  static validateNumber(
    value: unknown,
    fieldName: string,
    options: {
      required?: boolean;
      min?: number;
      max?: number;
      integer?: boolean;
    } = {},
  ): number {
    const { required = true, min, max, integer = false } = options;

    if (value === null || value === undefined) {
      if (required) {
        throw new ValidationException(`${fieldName} is required`);
      }
      return 0;
    }

    const num = Number(value);

    if (Number.isNaN(num) || !Number.isFinite(num)) {
      throw new ValidationException(`${fieldName} must be a valid number`);
    }

    if (integer && !Number.isInteger(num)) {
      throw new ValidationException(`${fieldName} must be an integer`);
    }

    if (min !== undefined && num < min) {
      throw new ValidationException(`${fieldName} must be at least ${min}`);
    }

    if (max !== undefined && num > max) {
      throw new ValidationException(`${fieldName} must be no more than ${max}`);
    }

    return num;
  }

  /**
   * Validate boolean input
   */
  static validateBoolean(
    value: unknown,
    fieldName: string,
    options: { required?: boolean } = {},
  ): boolean {
    const { required = true } = options;

    if (value === null || value === undefined) {
      if (required) {
        throw new ValidationException(`${fieldName} is required`);
      }
      return false;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      if (lower === 'true' || lower === '1' || lower === 'yes') {
        return true;
      }
      if (lower === 'false' || lower === '0' || lower === 'no') {
        return false;
      }
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    throw new ValidationException(`${fieldName} must be a boolean value`);
  }

  /**
   * Validate array input
   */
  static validateArray<T>(
    value: unknown,
    fieldName: string,
    itemValidator: (item: unknown, index: number) => T,
    options: {
      required?: boolean;
      minLength?: number;
      maxLength?: number;
    } = {},
  ): T[] {
    const { required = true, minLength = 0, maxLength = 1000 } = options;

    if (value === null || value === undefined) {
      if (required) {
        throw new ValidationException(`${fieldName} is required`);
      }
      return [];
    }

    if (!Array.isArray(value)) {
      throw new ValidationException(`${fieldName} must be an array`);
    }

    if (value.length < minLength) {
      throw new ValidationException(
        `${fieldName} must contain at least ${minLength} items`,
      );
    }

    if (value.length > maxLength) {
      throw new ValidationException(
        `${fieldName} must contain no more than ${maxLength} items`,
      );
    }

    return value.map((item, index) => {
      try {
        return itemValidator(item, index);
      } catch (error: unknown) {
        const message =
          error instanceof ValidationException ? error.message : 'Invalid item';
        throw new ValidationException(`${fieldName}[${index}]: ${message}`);
      }
    });
  }

  /**
   * Validate email format
   */
  static validateEmail(
    value: unknown,
    fieldName: string,
    required: boolean = true,
  ): string {
    const email = InputValidationUtil.validateString(value, fieldName, {
      maxLength: 254,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      required,
    });

    return email.toLowerCase();
  }

  /**
   * Validate URL format
   */
  static validateUrl(
    value: unknown,
    fieldName: string,
    required: boolean = true,
  ): string {
    const url = InputValidationUtil.validateString(value, fieldName, {
      maxLength: 2048,
      required,
    });

    if (url && !InputValidationUtil.isValidUrl(url)) {
      throw new ValidationException(`${fieldName} must be a valid URL`);
    }

    return url;
  }

  /**
   * Validate ObjectId
   */
  static validateObjectId(value: unknown, fieldName: string): string {
    if (!value || typeof value !== 'string') {
      throw new ValidationException(
        `${fieldName} is required and must be a string`,
      );
    }

    ObjectIdUtil.validate(value, fieldName);
    return value;
  }

  /**
   * Sanitize string to prevent XSS and injection attacks
   */
  private static sanitizeString(value: string, fieldName: string): string {
    let sanitized = value;

    // Check for dangerous patterns
    for (const pattern of InputValidationUtil.DANGEROUS_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(sanitized)) {
        throw new ValidationException(
          `${fieldName} contains potentially dangerous content`,
        );
      }
    }

    // Check for SQL injection patterns
    for (const pattern of InputValidationUtil.SQL_INJECTION_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(sanitized)) {
        throw new ValidationException(
          `${fieldName} contains potentially malicious SQL patterns`,
        );
      }
    }

    // Check for NoSQL injection patterns (more lenient for legitimate use)
    let noSqlPatternCount = 0;
    for (const pattern of InputValidationUtil.NOSQL_INJECTION_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(sanitized)) {
        noSqlPatternCount++;
      }
    }

    // If multiple NoSQL patterns are found, it's likely an injection attempt
    if (noSqlPatternCount >= 3) {
      throw new ValidationException(
        `${fieldName} contains potentially malicious NoSQL patterns`,
      );
    }

    // Basic HTML encoding for special characters
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');

    return sanitized;
  }

  /**
   * Check if string is a valid URL
   */
  private static isValidUrl(str: string): boolean {
    try {
      const url = new URL(str);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Validate file upload parameters
   */
  static validateFileUpload(
    file: Express.Multer.File | undefined,
    fieldName: string,
    options: {
      required?: boolean;
      maxSize?: number; // in bytes
      allowedMimeTypes?: string[];
      allowedExtensions?: string[];
      validationConfig?: ValidationConfigService;
    } = {},
  ): Express.Multer.File | null {
    const validationConfig = options.validationConfig;
    const {
      required = true,
      maxSize = validationConfig?.getMaxFileSize() || 100 * 1024 * 1024, // 100MB default
      allowedMimeTypes = [],
      allowedExtensions = [],
    } = options;

    if (!file) {
      if (required) {
        throw new ValidationException(`${fieldName} file is required`);
      }
      return null;
    }

    if (file.size > maxSize) {
      throw new ValidationException(
        `${fieldName} file size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size of ${(maxSize / 1024 / 1024).toFixed(2)}MB`,
      );
    }

    if (
      allowedMimeTypes.length > 0 &&
      !allowedMimeTypes.includes(file.mimetype)
    ) {
      throw new ValidationException(
        `${fieldName} file type ${file.mimetype} is not allowed. Allowed types: ${allowedMimeTypes.join(',')}`,
      );
    }

    if (allowedExtensions.length > 0) {
      const extension = file.originalname.split('.').pop()?.toLowerCase();
      if (!extension || !allowedExtensions.includes(extension)) {
        throw new ValidationException(
          `${fieldName} file extension .${extension || 'unknown'} is not allowed. Allowed extensions: ${allowedExtensions.join(',')}`,
        );
      }
    }

    return file;
  }
}

import { ValidationException } from '@files/helpers/exceptions/validation.exception';
import {
  createPathSecurityClass,
  DEFAULT_BLOCKED_PATTERNS,
} from '@libs/security';

/**
 * Security utilities for input validation and sanitization.
 * Path-traversal / command-injection sanitization is shared with the `api`
 * service via `@libs/security`; the shared guards throw this service's plain
 * `ValidationException` via the injected error factory.
 *
 * The `files` service additionally blocks `;` in file paths (media-processing
 * paths are handed to ffmpeg), so it extends the shared blocked-pattern set.
 */
export class SecurityUtil extends createPathSecurityClass({
  createError: (message) => new ValidationException(message),
  blockedPatterns: [...DEFAULT_BLOCKED_PATTERNS, ';'],
}) {}

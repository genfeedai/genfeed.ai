import { captureExtensionError } from '~services/error-tracking.service';

/**
 * Production-safe logger utility
 *
 * In development: Logs to console
 * In production: Only logs errors (via error tracking service)
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = {
  /**
   * Log debug messages (development only, more verbose)
   */
  debug: (...args: unknown[]): void => {
    if (isDevelopment) {
      console.debug('[Genfeed Debug]', ...args);
    }
  },

  /**
   * Log errors (always logged, but should use error tracking in production)
   */
  error: (
    message: string,
    error?: unknown,
    context?: Record<string, unknown>,
  ): void => {
    if (isDevelopment) {
      console.error('[Genfeed Error]', message, error, context);
    } else {
      captureExtensionError(message, error, context);
    }
  },

  /**
   * Log info messages (development only)
   */
  info: (...args: unknown[]): void => {
    if (isDevelopment) {
      console.info('[Genfeed]', ...args);
    }
  },
  /**
   * Log debug information (development only)
   */
  log: (...args: unknown[]): void => {
    if (isDevelopment) {
      console.log('[Genfeed]', ...args);
    }
  },

  /**
   * Log warnings (development only)
   */
  warn: (...args: unknown[]): void => {
    if (isDevelopment) {
      console.warn('[Genfeed]', ...args);
    }
  },
};

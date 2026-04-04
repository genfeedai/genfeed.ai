import chalk from 'chalk';

/**
 * Base error class for all Genfeed CLI tools.
 * Provides an optional `suggestion` field for actionable user guidance.
 *
 * Domain-specific repos extend this:
 * - CLI: `GenfeedError extends BaseCliError`
 * - Skills-Pro: `SkillsProError extends BaseCliError`
 */
export class BaseCliError extends Error {
  suggestion?: string;

  constructor(message: string, suggestion?: string) {
    super(message);
    this.name = 'BaseCliError';
    this.suggestion = suggestion;
  }
}

/**
 * Shared API error with HTTP status code.
 * Used identically by CLI and skills-pro for HTTP client errors.
 */
export class ApiError extends BaseCliError {
  statusCode?: number;

  constructor(message: string, statusCode?: number, suggestion?: string) {
    super(message, suggestion);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

/**
 * Format an error for terminal display.
 * Handles BaseCliError (with suggestion), generic Error, and unknown errors.
 */
export function formatError(error: unknown): string {
  if (error instanceof BaseCliError) {
    let output = chalk.red(`\u2716 ${error.message}`);
    if (error.suggestion) {
      output += `\n  ${chalk.dim(error.suggestion)}`;
    }
    return output;
  }

  if (error instanceof Error) {
    return chalk.red(`\u2716 ${error.message}`);
  }

  return chalk.red('\u2716 An unknown error occurred');
}

export interface HandleErrorOptions {
  /** When true, re-throws the error instead of exiting (for REPL mode). */
  replMode?: boolean;
}

/**
 * Print a formatted error and exit the process.
 * Supports REPL mode where errors are re-thrown instead of calling process.exit.
 */
export function handleError(
  error: unknown,
  options?: HandleErrorOptions,
): never {
  console.error(formatError(error));
  if (options?.replMode) {
    throw error;
  }
  process.exit(1);
}

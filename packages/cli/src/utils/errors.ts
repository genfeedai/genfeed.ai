import chalk from 'chalk';

// ── Base error classes (inlined from @genfeedai/errors) ─────────────────────

export class BaseCliError extends Error {
  suggestion?: string;
  constructor(message: string, suggestion?: string) {
    super(message);
    this.name = 'BaseCliError';
    this.suggestion = suggestion;
  }
}

export class ApiError extends BaseCliError {
  statusCode?: number;
  constructor(message: string, statusCode?: number, suggestion?: string) {
    super(message, suggestion);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

export function formatError(error: unknown): string {
  if (error instanceof BaseCliError) {
    let output = chalk.red(`✖ ${error.message}`);
    if (error.suggestion) {
      output += `\n  ${chalk.dim(error.suggestion)}`;
    }
    return output;
  }
  if (error instanceof Error) {
    return chalk.red(`✖ ${error.message}`);
  }
  return chalk.red('✖ An unknown error occurred');
}

export interface HandleErrorOptions {
  replMode?: boolean;
}

function baseHandleError(error: unknown, options?: HandleErrorOptions): never {
  console.error(formatError(error));
  if (options?.replMode) {
    throw error;
  }
  process.exit(1);
}

// ── CLI-specific errors ─────────────────────────────────────────────────────

export class GenfeedError extends BaseCliError {
  constructor(message: string, suggestion?: string) {
    super(message, suggestion);
    this.name = 'GenfeedError';
  }
}

export class AuthError extends GenfeedError {
  constructor(message = 'Not authenticated') {
    super(message, 'Run `gf login` to authenticate');
    this.name = 'AuthError';
  }
}

export class AdminRequiredError extends GenfeedError {
  constructor() {
    super('This command requires admin access.', 'Contact your organization admin for access.');
    this.name = 'AdminRequiredError';
  }
}

export class NoBrandError extends GenfeedError {
  constructor() {
    super('No brand selected', 'Run `gf brands select` to choose a brand');
    this.name = 'NoBrandError';
  }
}

export class DarkroomApiError extends GenfeedError {
  constructor(message: string, suggestion?: string) {
    super(message, suggestion ?? 'Check darkroom connectivity with `gf darkroom health`');
    this.name = 'DarkroomApiError';
  }
}

let replMode = false;

export function setReplMode(enabled: boolean): void {
  replMode = enabled;
}

export function handleError(error: unknown): never {
  baseHandleError(error, { replMode });
}

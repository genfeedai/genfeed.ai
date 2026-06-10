// ── Re-exports from @genfeedai/errors ────────────────────────────────────────
export { ApiError, BaseCliError, formatError, type HandleErrorOptions } from '@genfeedai/errors';

import { BaseCliError, formatError } from '@genfeedai/errors';

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
  console.error(formatError(error));
  if (replMode) {
    throw error;
  }
  process.exit(1);
}

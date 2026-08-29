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

export class NoBrandError extends GenfeedError {
  constructor() {
    super('No brand selected', 'Run `gf brand use` to choose a brand');
    this.name = 'NoBrandError';
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

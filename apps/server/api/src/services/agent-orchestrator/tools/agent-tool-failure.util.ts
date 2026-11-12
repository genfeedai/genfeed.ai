import { HttpException, HttpStatus } from '@nestjs/common';

export const AGENT_TOOL_UNEXPECTED_FAILURE_MESSAGE =
  'Something went wrong while running this action. Please try again.';

const INTERNAL_ERROR_NAMES = new Set([
  'ReferenceError',
  'RangeError',
  'SyntaxError',
  'TypeError',
]);

const DATABASE_CLIENT_TEXT_PATTERN =
  /\bprisma\.\w+\.\w+\(\)|\bPrismaClient\w*|\bInvalid `prisma\b/i;

function isInternalError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }
  if (error instanceof HttpException) {
    return error.getStatus() >= HttpStatus.INTERNAL_SERVER_ERROR;
  }
  return (
    error.name.startsWith('PrismaClient') ||
    INTERNAL_ERROR_NAMES.has(error.name) ||
    DATABASE_CLIENT_TEXT_PATTERN.test(error.message)
  );
}

/**
 * The text a tool failure may show in chat and feed back to the model. A tool
 * that rejects a request on purpose (a validation message, a 4xx exception,
 * a guard error) keeps its text. A database client error, a programming error
 * or a server-side exception shows a plain message; the caller logs the
 * original.
 */
export function describeToolFailure(error: unknown): string {
  if (isInternalError(error)) {
    return AGENT_TOOL_UNEXPECTED_FAILURE_MESSAGE;
  }
  return (error as Error).message;
}

export function describeToolFailureForLog(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return typeof error === 'string' ? error : 'Unknown error';
}

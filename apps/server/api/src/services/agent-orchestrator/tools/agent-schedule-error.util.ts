import { HttpException, HttpStatus } from '@nestjs/common';

const SAFE_AGENT_SCHEDULE_VALIDATION_STATUSES = new Set<number>([
  HttpStatus.BAD_REQUEST,
  HttpStatus.NOT_FOUND,
  HttpStatus.CONFLICT,
  HttpStatus.UNPROCESSABLE_ENTITY,
]);

export const SAFE_AGENT_SCHEDULE_ERROR =
  'The canonical release target could not be scheduled safely.';

export function readAgentScheduleValidationError(
  error: unknown,
): string | undefined {
  if (!(error instanceof HttpException)) {
    return undefined;
  }
  if (!SAFE_AGENT_SCHEDULE_VALIDATION_STATUSES.has(error.getStatus())) {
    return undefined;
  }

  const response = error.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return undefined;
  }

  const record = response as Record<string, unknown>;
  if (typeof record.detail === 'string' && record.detail.trim()) {
    return record.detail;
  }
  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message;
  }
  if (Array.isArray(record.message)) {
    const messages = record.message.filter(
      (message): message is string => typeof message === 'string',
    );
    return messages.length > 0 ? messages.join('; ') : undefined;
  }
  return undefined;
}

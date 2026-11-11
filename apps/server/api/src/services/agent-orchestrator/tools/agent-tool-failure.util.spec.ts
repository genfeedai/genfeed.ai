import {
  AGENT_TOOL_UNEXPECTED_FAILURE_MESSAGE,
  describeToolFailure,
} from '@api/services/agent-orchestrator/tools/agent-tool-failure.util';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';

class PrismaClientValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrismaClientValidationError';
  }
}

describe('describeToolFailure', () => {
  it.each([
    [
      'a database client error',
      new PrismaClientValidationError(
        'Invalid `prisma.post.create()` invocation: Argument description is missing.',
      ),
    ],
    [
      'a wrapped database client message',
      new Error('Invalid `prisma.post.create()` invocation in worker'),
    ],
    [
      'a programming error',
      new TypeError("Cannot read properties of undefined (reading 'id')"),
    ],
    [
      'a 5xx exception',
      new InternalServerErrorException('db.internal is down'),
    ],
    ['a thrown string', 'boom'],
  ])('shows the plain message for %s', (_label, error) => {
    expect(describeToolFailure(error)).toBe(
      AGENT_TOOL_UNEXPECTED_FAILURE_MESSAGE,
    );
  });

  it.each([
    [
      'a plain guard error',
      new Error(
        'Tool brand parameters must match the validated thread brand scope.',
      ),
    ],
    [
      'a 400 exception',
      new BadRequestException('scheduledAt must be a valid date and time.'),
    ],
  ])('keeps the text of %s', (_label, error) => {
    expect(describeToolFailure(error)).toBe((error as Error).message);
  });
});

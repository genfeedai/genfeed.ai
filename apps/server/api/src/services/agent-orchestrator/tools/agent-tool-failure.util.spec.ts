import {
  AGENT_TOOL_UNEXPECTED_FAILURE_MESSAGE,
  describeToolFailure,
  isDeliberateToolRejection,
} from '@api/services/agent-orchestrator/tools/agent-tool-failure.util';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
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

describe('describeToolFailure with an object body', () => {
  it('shows the reason of a refusal instead of "Http Exception"', () => {
    const error = new HttpException(
      { detail: 'Insufficient credits: 37 required, 5000 available' },
      HttpStatus.PAYMENT_REQUIRED,
    );

    expect(describeToolFailure(error)).toBe(
      'Insufficient credits: 37 required, 5000 available',
    );
  });
});

describe('isDeliberateToolRejection', () => {
  it.each([
    [
      'a 400 exception',
      new BadRequestException('Answer the choice first.'),
      true,
    ],
    ['a 403 exception', new ForbiddenException('Brand access denied'), true],
    ['a 5xx exception', new InternalServerErrorException('boom'), false],
    ['a plain error', new Error('socket hang up'), false],
    ['a thrown string', 'boom', false],
  ])('classifies %s', (_label, error, expected) => {
    expect(isDeliberateToolRejection(error)).toBe(expected);
  });
});

describe('isDeliberateToolRejection for action contracts', () => {
  function contractError(boundary: 'input' | 'output'): Error {
    const error = new Error(
      `Action contract ${boundary} validation failed [action=get_assets node=n] $: must have required property 'type'`,
    );
    error.name = 'ActionContractValidationError';
    return error;
  }

  it('treats an input the model got wrong as a handled rejection', () => {
    expect(isDeliberateToolRejection(contractError('input'))).toBe(true);
  });

  it('keeps an output violation a fault', () => {
    expect(isDeliberateToolRejection(contractError('output'))).toBe(false);
  });
});

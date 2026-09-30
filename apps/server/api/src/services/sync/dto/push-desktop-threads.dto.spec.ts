import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import {
  DesktopThreadDto,
  PushDesktopThreadsDto,
} from '@api/services/sync/dto/push-desktop-threads.dto';
import type { IValidationErrorResponse } from '@genfeedai/contracts/interfaces';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';

const MAX_THREADS = 500;
const MAX_MESSAGES_PER_THREAD = 500;

const bodyMetadata: ArgumentMetadata = {
  metatype: PushDesktopThreadsDto,
  type: 'body',
};

const threadMetadata: ArgumentMetadata = {
  metatype: DesktopThreadDto,
  type: 'body',
};

function buildMessages(messageCount: number) {
  return Array.from({ length: messageCount }, (_value, index) => ({
    content: `message ${index}`,
    createdAt: '2026-07-01T00:00:00.000Z',
    id: `message-${index}`,
    role: 'user',
  }));
}

function buildThread(index: number, messageCount = 0) {
  return {
    createdAt: '2026-07-01T00:00:00.000Z',
    id: `thread-${index}`,
    messages: buildMessages(messageCount),
    title: `Thread ${index}`,
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

function buildBody(threadCount: number) {
  return {
    localUserId: 'local-user-1',
    threads: Array.from({ length: threadCount }, (_value, index) =>
      buildThread(index),
    ),
  };
}

function findConstraints(error: BadRequestException | null, property: string) {
  const response = error?.getResponse() as IValidationErrorResponse;

  return response.errors.find((entry) => entry.property === property)
    ?.constraints;
}

describe('PushDesktopThreadsDto', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe();
  });

  it(`accepts a threads array at the ${MAX_THREADS} limit`, async () => {
    await expect(
      pipe.transform(buildBody(MAX_THREADS), bodyMetadata),
    ).resolves.toBeInstanceOf(PushDesktopThreadsDto);
  });

  it('rejects an over-limit threads array with a 400', async () => {
    const error = await pipe
      .transform(buildBody(MAX_THREADS + 1), bodyMetadata)
      .then(
        () => null,
        (thrown: unknown) => thrown as BadRequestException,
      );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(findConstraints(error, 'threads')).toHaveProperty('arrayMaxSize');
  });

  it(`accepts a thread whose messages array is at the ${MAX_MESSAGES_PER_THREAD} limit`, async () => {
    await expect(
      pipe.transform(buildThread(0, MAX_MESSAGES_PER_THREAD), threadMetadata),
    ).resolves.toBeInstanceOf(DesktopThreadDto);
  });

  it('rejects a thread with an over-limit messages array with a 400', async () => {
    const error = await pipe
      .transform(buildThread(0, MAX_MESSAGES_PER_THREAD + 1), threadMetadata)
      .then(
        () => null,
        (thrown: unknown) => thrown as BadRequestException,
      );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(findConstraints(error, 'messages')).toHaveProperty('arrayMaxSize');
  });

  it('rejects a nested over-limit messages array pushed through the body DTO', async () => {
    const body = {
      localUserId: 'local-user-1',
      threads: [buildThread(0, MAX_MESSAGES_PER_THREAD + 1)],
    };

    await expect(pipe.transform(body, bodyMetadata)).rejects.toThrow(
      BadRequestException,
    );
  });
});

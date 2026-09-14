import {
  CheckoutTaskDto,
  ReleaseTaskDto,
} from '@api/collections/tasks/dto/task-lease.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('task lease DTOs', () => {
  it('accepts task checkout and release identifiers', async () => {
    expect(
      await validate(
        plainToInstance(CheckoutTaskDto, {
          agentId: 'agent-id',
          runId: 'run-id',
        }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(ReleaseTaskDto, { agentId: 'agent-id' })),
    ).toHaveLength(0);
  });

  it.each([undefined, null, '', 123, []])(
    'rejects invalid agent identifiers %s',
    async (agentId) => {
      expect(
        await validate(plainToInstance(ReleaseTaskDto, { agentId })),
      ).not.toHaveLength(0);
    },
  );

  it.each([undefined, null, '', 123, []])(
    'rejects invalid run identifiers %s',
    async (runId) => {
      expect(
        await validate(
          plainToInstance(CheckoutTaskDto, { agentId: 'agent-id', runId }),
        ),
      ).not.toHaveLength(0);
    },
  );
});

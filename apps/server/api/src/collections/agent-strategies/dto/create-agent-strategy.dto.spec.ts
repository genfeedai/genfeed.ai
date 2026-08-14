import 'reflect-metadata';

import {
  CreateAgentStrategyDto,
  WorkflowInputOverrideDto,
} from '@api/collections/agent-strategies/dto/create-agent-strategy.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('WorkflowInputOverrideDto', () => {
  it('accepts scalar override values', async () => {
    for (const value of ['cta', 3, false]) {
      const dto = plainToInstance(WorkflowInputOverrideDto, {
        key: 'cta',
        value,
      });
      await expect(validate(dto)).resolves.toEqual([]);
    }
  });

  it('rejects nested override values', async () => {
    const dto = plainToInstance(WorkflowInputOverrideDto, {
      key: 'cta',
      value: { nested: true },
    });
    const errors = await validate(dto);
    expect(errors[0]?.constraints).toMatchObject({
      isScalarWorkflowOverride:
        'workflowInputOverrides.value must be a string, number, or boolean',
    });
  });
});

describe('CreateAgentStrategyDto', () => {
  it('requires a label and accepts a minimal payload', async () => {
    const missing = plainToInstance(CreateAgentStrategyDto, {});
    const missingErrors = await validate(missing);
    expect(missingErrors.some((error) => error.property === 'label')).toBe(
      true,
    );

    const dto = plainToInstance(CreateAgentStrategyDto, {
      label: 'Always-on clips',
      workflowInputOverrides: [{ key: 'cta', value: 'Follow' }],
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });
});

import 'reflect-metadata';

import {
  CreateAgentStrategyDto,
  WorkflowInputOverrideDto,
} from '@api/collections/agent-strategies/dto/create-agent-strategy.dto';
import { UpdateAgentStrategyDto } from '@api/collections/agent-strategies/dto/update-agent-strategy.dto';
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

  it('accepts an empty skill list for brand-default inheritance', async () => {
    const dto = plainToInstance(CreateAgentStrategyDto, {
      label: 'Always-on clips',
      skillSlugs: [],
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects duplicate or blank skill slugs', async () => {
    const duplicate = plainToInstance(CreateAgentStrategyDto, {
      label: 'Always-on clips',
      skillSlugs: ['brand-voice', 'brand-voice'],
    });
    const blank = plainToInstance(CreateAgentStrategyDto, {
      label: 'Always-on clips',
      skillSlugs: ['   '],
    });

    expect(
      (await validate(duplicate)).some(
        (error) => error.property === 'skillSlugs',
      ),
    ).toBe(true);
    expect(
      (await validate(blank)).some((error) => error.property === 'skillSlugs'),
    ).toBe(true);
  });

  it('rejects null skill slugs instead of persisting malformed JSON', async () => {
    const createDto = plainToInstance(CreateAgentStrategyDto, {
      label: 'Always-on clips',
      skillSlugs: null,
    });
    const updateDto = plainToInstance(UpdateAgentStrategyDto, {
      skillSlugs: null,
    });

    expect(
      (await validate(createDto)).some(
        (error) => error.property === 'skillSlugs',
      ),
    ).toBe(true);
    expect(
      (await validate(updateDto)).some(
        (error) => error.property === 'skillSlugs',
      ),
    ).toBe(true);
  });
});

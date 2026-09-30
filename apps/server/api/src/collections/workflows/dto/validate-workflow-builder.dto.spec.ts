import {
  ValidateWorkflowConnectionDto,
  ValidateWorkflowInputsDto,
} from '@api/collections/workflows/dto/validate-workflow-builder.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('workflow builder validation DTOs', () => {
  const connection = {
    sourceHandle: 'output',
    sourceType: 'image',
    targetHandle: 'input',
    targetType: 'video',
  };

  it('accepts connection handles and arbitrary input values', async () => {
    expect(
      await validate(
        plainToInstance(ValidateWorkflowConnectionDto, connection),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(ValidateWorkflowInputsDto, {
          inputs: { nested: { enabled: true }, values: [1, 'two'] },
        }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(ValidateWorkflowInputsDto, { inputs: {} }),
      ),
    ).toHaveLength(0);
  });

  it.each(Object.keys(connection))(
    'rejects a non-string connection field %s',
    async (field) => {
      expect(
        await validate(
          plainToInstance(ValidateWorkflowConnectionDto, {
            ...connection,
            [field]: 123,
          }),
        ),
      ).not.toHaveLength(0);
    },
  );

  it('accepts the workflow reference client body without inputs', async () => {
    const result = await new ValidationPipe().transform(
      { childWorkflowId: 'child-workflow' },
      { metatype: ValidateWorkflowInputsDto, type: 'body' },
    );

    expect(result).toBeInstanceOf(ValidateWorkflowInputsDto);
    expect(result).toMatchObject({ inputs: undefined });
  });

  it.each([undefined, null])('accepts omitted inputs %s', async (inputs) => {
    expect(
      await validate(plainToInstance(ValidateWorkflowInputsDto, { inputs })),
    ).toHaveLength(0);
  });

  it.each([[], 'input'])('rejects non-object inputs %s', async (inputs) => {
    expect(
      await validate(plainToInstance(ValidateWorkflowInputsDto, { inputs })),
    ).not.toHaveLength(0);
  });
});

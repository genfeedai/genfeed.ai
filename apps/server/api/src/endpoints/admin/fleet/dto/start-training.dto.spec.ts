import { StartTrainingDto } from '@api/endpoints/admin/fleet/dto/start-training.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('StartTrainingDto validation', () => {
  const base = {
    personaSlug: 'persona-a',
    label: 'My LoRA',
  };

  it('accepts a valid set of entity-id sourceIds', async () => {
    const dto = plainToInstance(StartTrainingDto, {
      ...base,
      sourceIds: [
        '550e8400-e29b-41d4-a716-446655440011',
        '550e8400-e29b-41d4-a716-446655440012',
      ],
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'sourceIds')).toBe(false);
  });

  it('rejects a malformed sourceId so it cannot reach toValidId and become null', async () => {
    const dto = plainToInstance(StartTrainingDto, {
      ...base,
      sourceIds: ['550e8400-e29b-41d4-a716-446655440011', 'not-an-id'],
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'sourceIds')).toBe(true);
  });
});

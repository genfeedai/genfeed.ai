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
      sourceIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'sourceIds')).toBe(false);
  });

  it('rejects a malformed sourceId so it cannot reach toObjectId and become null', async () => {
    const dto = plainToInstance(StartTrainingDto, {
      ...base,
      sourceIds: ['507f1f77bcf86cd799439011', 'not-an-id'],
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'sourceIds')).toBe(true);
  });
});

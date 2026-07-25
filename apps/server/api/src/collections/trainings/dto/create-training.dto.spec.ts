import {
  CreateTrainingDto,
  MAX_TRAINING_SOURCES,
} from '@api/collections/trainings/dto/create-training.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const VALID_SOURCE_ID = '507f191e810c19729de860ee';

function buildPayload(sourceCount: number): Record<string, unknown> {
  return {
    category: 'subject',
    label: 'Custom Model',
    sources: Array.from({ length: sourceCount }, () => VALID_SOURCE_ID),
    steps: 1000,
    trigger: 'TOK',
  };
}

async function sourcesErrorsFor(sourceCount: number) {
  const dto = plainToInstance(CreateTrainingDto, buildPayload(sourceCount));
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'sources');
}

describe('CreateTrainingDto', () => {
  it('should be defined', () => {
    expect(CreateTrainingDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateTrainingDto();
      expect(dto).toBeInstanceOf(CreateTrainingDto);
    });

    it('accepts a sources array at the maximum size', async () => {
      expect(await sourcesErrorsFor(MAX_TRAINING_SOURCES)).toEqual([]);
    });

    it('rejects a sources array over the maximum size', async () => {
      const sourcesErrors = await sourcesErrorsFor(MAX_TRAINING_SOURCES + 1);

      expect(sourcesErrors).toHaveLength(1);
      expect(sourcesErrors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });

    it('still accepts the ten-source floor enforced by the handlers', async () => {
      expect(await sourcesErrorsFor(10)).toEqual([]);
    });
  });
});

import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

function entityId(index: number): string {
  return `c${String(index).padStart(8, '0')}`;
}

async function referencesErrorsFor(referenceCount: number) {
  const dto = plainToInstance(CreateImageDto, {
    references: Array.from({ length: referenceCount }, (_, i) => entityId(i)),
    text: 'a prompt',
  });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'references');
}

describe('CreateImageDto', () => {
  it('should be defined', () => {
    expect(CreateImageDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateImageDto();
      expect(dto).toBeInstanceOf(CreateImageDto);
    });

    it('accepts a references array at the maximum size', async () => {
      expect(await referencesErrorsFor(10)).toEqual([]);
    });

    it('rejects a references array over the maximum size', async () => {
      const referencesErrors = await referencesErrorsFor(11);

      expect(referencesErrors).toHaveLength(1);
      expect(referencesErrors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });
  });
});

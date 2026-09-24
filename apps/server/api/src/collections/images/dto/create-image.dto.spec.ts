import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
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

  describe.each([
    MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO_LORA,
    MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID_LORA,
  ])('%s LoRA selection', (model) => {
    it.each([
      undefined,
      null,
      '',
      ' ',
      '../private.safetensors',
      '/private.safetensors',
      'styles/../private.safetensors',
      'model.bin',
    ])('rejects missing or invalid model path %s', async (loraPath) => {
      const dto = plainToInstance(CreateImageDto, {
        model,
        loraPath,
        text: 'a prompt',
      });
      const errors = await validate(dto, { whitelist: true });
      expect(errors.some((error) => error.property === 'loraPath')).toBe(true);
    });

    it('preserves an explicit model name through request validation', async () => {
      const dto = plainToInstance(CreateImageDto, {
        model,
        loraPath: ' styles/product.safetensors ',
        text: 'a prompt',
      });
      const errors = await validate(dto, { whitelist: true });
      expect(errors.filter((error) => error.property === 'loraPath')).toEqual(
        [],
      );
      expect(dto.loraPath).toBe('styles/product.safetensors');
    });
  });

  it('does not require a LoRA for a base image model', async () => {
    const dto = plainToInstance(CreateImageDto, {
      model: MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
      text: 'a prompt',
    });
    const errors = await validate(dto, { whitelist: true });
    expect(errors.filter((error) => error.property === 'loraPath')).toEqual([]);
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

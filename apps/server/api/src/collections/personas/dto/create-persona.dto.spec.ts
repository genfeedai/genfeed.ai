import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function handleErrorsFor(handle: unknown) {
  const dto = plainToInstance(CreatePersonaDto, {
    handle,
    label: 'Anna',
  });
  const errors = await validate(dto);
  return errors.filter((error) => error.property === 'handle');
}

describe('CreatePersonaDto', () => {
  it('should be defined', () => {
    expect(CreatePersonaDto).toBeDefined();
  });

  it('accepts a valid lowercase handle', async () => {
    expect(await handleErrorsFor('anna')).toEqual([]);
    expect(await handleErrorsFor('red-jacket_01')).toEqual([]);
  });

  it('lowercases mixed-case handles before validating', async () => {
    const dto = plainToInstance(CreatePersonaDto, {
      handle: 'Anna',
      label: 'Anna',
    });
    expect(dto.handle).toBe('anna');
    expect(await validate(dto)).toEqual([]);
  });

  it('treats empty handles as omitted', async () => {
    const dto = plainToInstance(CreatePersonaDto, {
      handle: '  ',
      label: 'Anna',
    });
    expect(dto.handle).toBeNull();
    expect(await handleErrorsFor('')).toEqual([]);
  });

  it('rejects handles that are not URL-safe', async () => {
    const errors = await handleErrorsFor('anna doe');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects one-character handles', async () => {
    const errors = await handleErrorsFor('a');
    expect(errors.length).toBeGreaterThan(0);
  });
});

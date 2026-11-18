import { AvatarMotionDto } from '@api/collections/videos/dto/avatar-motion.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function errorsFor(value: object) {
  return (await validate(plainToInstance(AvatarMotionDto, value))).map(
    (error) => error.property,
  );
}

describe('AvatarMotionDto', () => {
  it.each([
    {},
    { expressiveness: 'default' },
    { expressiveness: 'less', prompt: 'Smile warmly.' },
    { prompt: 'x'.repeat(1200) },
  ])('accepts %j', async (value) => {
    expect(await errorsFor(value)).toEqual([]);
  });

  it.each([
    [{ expressiveness: 'more' }, 'expressiveness'],
    [{ prompt: 'x'.repeat(1201) }, 'prompt'],
    [{ prompt: 12 }, 'prompt'],
  ])('rejects %j on %s', async (value, property) => {
    expect(await errorsFor(value)).toEqual([property]);
  });
});

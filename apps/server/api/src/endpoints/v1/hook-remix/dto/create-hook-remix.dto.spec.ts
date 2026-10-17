import { CreateHookRemixDto } from '@api/endpoints/v1/hook-remix/dto/create-hook-remix.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const baseDto = {
  brandId: 'cmbrand000000000000000001',
  ctaIngredientId: 'cmingredient00000000000001',
};

async function youtubeUrlErrors(youtubeUrl: string): Promise<string[]> {
  const errors = await validate(
    plainToInstance(CreateHookRemixDto, { ...baseDto, youtubeUrl }),
  );
  return errors
    .filter((error) => error.property === 'youtubeUrl')
    .map((error) => error.property);
}

describe('CreateHookRemixDto youtubeUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
  ])('accepts %s', async (url) => {
    expect(await youtubeUrlErrors(url)).toEqual([]);
  });

  it.each([
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://169.254.169.254/latest/meta-data/',
    'https://internal.example.com/video.mp4',
    'https://www.youtube.com.attacker.example/watch?v=x',
    'file:///etc/passwd',
    '--exec=id',
  ])('rejects %s', async (url) => {
    expect(await youtubeUrlErrors(url)).toEqual(['youtubeUrl']);
  });
});

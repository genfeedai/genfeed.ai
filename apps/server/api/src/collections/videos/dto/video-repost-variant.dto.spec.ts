import { VideoRepostVariantDto } from '@api/collections/videos/dto/video-repost-variant.dto';
import { REPOST_VARIANT_PRESET } from '@genfeedai/contracts/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function errorsFor(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(VideoRepostVariantDto, body));
  return errors.map((error) => error.property).sort();
}

describe('VideoRepostVariantDto', () => {
  it('accepts the values the dialog offers', async () => {
    await expect(
      errorsFor({ isMirrored: true, ...REPOST_VARIANT_PRESET }),
    ).resolves.toEqual([]);
  });

  it('accepts an empty body, so the controller can say what to pick', async () => {
    await expect(errorsFor({})).resolves.toEqual([]);
  });

  it.each([
    [{ speed: 0.5 }, ['speed']],
    [{ speed: 3 }, ['speed']],
    [{ zoom: 2 }, ['zoom']],
    [{ trimStartSeconds: -1 }, ['trimStartSeconds']],
    [{ trimStartSeconds: 30 }, ['trimStartSeconds']],
    [{ isMirrored: 'yes' }, ['isMirrored']],
    [{ speed: '1.1' }, ['speed']],
  ])('rejects %j', async (body, properties) => {
    await expect(errorsFor(body)).resolves.toEqual(properties);
  });
});

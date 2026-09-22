import { RecordSignupAttributionDto } from '@api/collections/users/dto/record-signup-attribution.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { describe, expect, it } from 'vitest';

describe('RecordSignupAttributionDto', () => {
  const transform = (value: Record<string, unknown>) =>
    new ValidationPipe().transform(value, {
      metatype: RecordSignupAttributionDto,
      type: 'body',
    });

  it('normalizes values and strips undeclared fields', async () => {
    await expect(
      transform({
        email: 'someone@example.com',
        landingPath: '/use-cases/creators?email=a',
        referrerDomain: 'https://www.Google.com/search',
        utmSource: ' ChatGPT ',
      }),
    ).resolves.toEqual({
      landingPath: '/use-cases/creators',
      referrerDomain: 'google.com',
      utmSource: 'chatgpt',
    });
  });

  it('drops an unusable value instead of rejecting the attribution', async () => {
    const dto = await transform({
      landingPath: 'https://evil.test/',
      utmCampaign: '<script>',
      utmMedium: 42,
      utmSource: 'google',
    });

    expect(dto).toMatchObject({ utmSource: 'google' });
    expect(dto.landingPath).toBeUndefined();
    expect(dto.utmCampaign).toBeUndefined();
    expect(dto.utmMedium).toBeUndefined();
  });
});

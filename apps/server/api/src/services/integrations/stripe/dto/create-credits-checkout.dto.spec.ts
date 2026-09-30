import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCreditsCheckoutDto } from './create-credits-checkout.dto';

describe('CreateCreditsCheckoutDto', () => {
  it('accepts a whole canonical credit quantity', async () => {
    const dto = plainToInstance(CreateCreditsCheckoutDto, { credits: 5_000 });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([999, 1_000_001, 1_000.5, Number.NaN])(
    'rejects an invalid credit quantity %s',
    async (credits) => {
      const dto = plainToInstance(CreateCreditsCheckoutDto, { credits });

      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
});

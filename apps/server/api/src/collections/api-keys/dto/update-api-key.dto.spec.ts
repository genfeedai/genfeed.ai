import { UpdateApiKeyDto } from '@api/collections/api-keys/dto/update-api-key.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function invalidFields(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(UpdateApiKeyDto, body));

  return errors.map((error) => error.property).sort();
}

describe('UpdateApiKeyDto', () => {
  it('accepts an empty patch', async () => {
    await expect(invalidFields({})).resolves.toEqual([]);
  });

  it('accepts a patch that changes only the label', async () => {
    await expect(invalidFields({ label: 'Renamed' })).resolves.toEqual([]);
  });

  it('accepts scopes, expiry and IP allowlist when present', async () => {
    await expect(
      invalidFields({
        allowedIps: ['203.0.113.7'],
        expiresAt: '2030-12-31T23:59:59Z',
        scopes: ['videos:read'],
      }),
    ).resolves.toEqual([]);
  });

  it.each([['scopes'], ['expiresAt'], ['allowedIps']])(
    'rejects JSON null for %s instead of clearing it',
    async (field) => {
      await expect(invalidFields({ [field]: null })).resolves.toEqual([field]);
    },
  );

  it('rejects a scope outside the self-service presets', async () => {
    await expect(invalidFields({ scopes: ['*'] })).resolves.toEqual(['scopes']);
  });
});

import { CreateApiKeyDto } from '@api/collections/api-keys/dto/create-api-key.dto';
import { ApiKeyCategory } from '@genfeedai/contracts';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function invalidFields(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(
    plainToInstance(CreateApiKeyDto, {
      category: ApiKeyCategory.GENFEEDAI,
      label: 'MCP Server Key',
      ...body,
    }),
  );

  return errors.map((error) => error.property).sort();
}

describe('CreateApiKeyDto', () => {
  it('accepts a body that omits scopes, expiry and IP allowlist', async () => {
    await expect(invalidFields({})).resolves.toEqual([]);
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
    'rejects JSON null for %s instead of treating it as omitted',
    async (field) => {
      await expect(invalidFields({ [field]: null })).resolves.toEqual([field]);
    },
  );

  it('rejects a scope outside the self-service presets', async () => {
    await expect(invalidFields({ scopes: ['*'] })).resolves.toEqual(['scopes']);
  });
});

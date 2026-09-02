import { BillingPortalQueryDto } from '@api/services/integrations/stripe/dto/billing-portal-query.dto';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ValidationPipe } from '@server/helpers/pipes/validation.pipe';

const metadata: ArgumentMetadata = {
  metatype: BillingPortalQueryDto,
  type: 'query',
};

describe('BillingPortalQueryDto', () => {
  const pipe = new ValidationPipe();

  it.each([
    {},
    { returnPath: '/acme/~/settings/organization/subscription' },
    { returnPath: '/acme/~/settings/organization/subscription?tab=billing' },
  ])('accepts the canonical portal query %#', async (query) => {
    await expect(pipe.transform(query, metadata)).resolves.toBeInstanceOf(
      BillingPortalQueryDto,
    );
  });

  it.each([
    { returnPath: ['/acme/~/settings', '/admin'] },
    { returnPath: { path: '/acme/~/settings' } },
    { returnPath: 123 },
  ])('rejects the type-confused portal query %#', async (query) => {
    await expect(pipe.transform(query, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([
    { returnPath: 'https://evil.example.com' },
    { returnPath: '//evil.example.com' },
    { returnPath: '\\\\evil.example.com' },
    { returnPath: 'settings/organization/subscription' },
    { returnPath: '/acme\\evil.example.com' },
  ])('rejects the tampered portal query %#', async (query) => {
    await expect(pipe.transform(query, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

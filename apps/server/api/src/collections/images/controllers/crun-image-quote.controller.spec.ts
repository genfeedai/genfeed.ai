import { CrunImageQuoteController } from '@api/collections/images/controllers/crun-image-quote.controller';
import { CreateCrunImageQuoteDto } from '@api/collections/images/dto/create-crun-image-quote.dto';
import { ValidationPipe } from '@nestjs/common';

const available = {
  id: 'response-id',
  isAvailable: true,
  quoteId: 'opaque-quote',
  expiresAt: '2026-10-01T12:01:00.000Z',
  modelKey: 'crun/google/nano-banana-pro',
  contractVersion: 'reviewed',
  credits: 12,
  billingMode: 'credits',
  reasonCode: null,
};
describe('Crun quote endpoint boundary', () => {
  it.each([
    available,
    {
      ...available,
      isAvailable: false,
      quoteId: null,
      expiresAt: null,
      contractVersion: null,
      credits: null,
      billingMode: null,
      reasonCode: 'PRICING_UNAVAILABLE',
    },
  ])(
    'serializes the complete public availability union and excludes private fields',
    async (record) => {
      const preview = {
        quote: vi.fn().mockResolvedValue({
          ...record,
          credentialFingerprint: 'secret',
          request: { prompt: 'private' },
          providerQuote: { creditsPerUsd: '1000' },
        }),
      };
      const controller = new CrunImageQuoteController(preview as never);
      const request = { originalUrl: '/images/crun-quote' };
      const dto = {
        model: available.modelKey,
        text: 'Bird',
        crunControls: { contractVersion: 'reviewed' },
      };
      const response = await controller.quote(dto as never, request as never);
      const { id, ...attributes } = record;
      expect(response.data).toEqual({
        id,
        type: 'crun-generation-quote',
        attributes,
      });
      expect(preview.quote).toHaveBeenCalledWith(dto, request);
      expect(JSON.stringify(response)).not.toContain('secret');
      expect(JSON.stringify(response)).not.toContain('private');
    },
  );
  it.each([
    { extra: 'unknown' },
    { outputs: '4' },
    { outputs: null },
    { crunControls: { contractVersion: 'reviewed', seed: 42 } },
  ])(
    'denies malformed or unknown admission fields before service execution %j',
    async (invalid) => {
      const pipe = new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      await expect(
        pipe.transform(
          {
            model: available.modelKey,
            text: 'Bird',
            crunControls: { contractVersion: 'reviewed' },
            ...invalid,
          },
          { type: 'body', metatype: CreateCrunImageQuoteDto },
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
});

import { generateKeyPairSync } from 'node:crypto';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { ConfigService } from '@libs/config/config.service';
import type { MediaUrlConfig } from '@libs/media/media-url.util';
import { Test } from '@nestjs/testing';

// Generated per run: no key material is ever committed. Signature
// correctness is covered in `@libs/media/media-url.util.spec.ts`; this spec
// checks the service passes the deployment's config through.
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { format: 'pem', type: 'pkcs1' },
  publicKeyEncoding: { format: 'pem', type: 'spki' },
});

async function buildService(mediaUrlConfig: MediaUrlConfig) {
  const module = await Test.createTestingModule({
    providers: [
      MediaUrlService,
      { provide: ConfigService, useValue: { mediaUrlConfig } },
    ],
  }).compile();
  return module.get(MediaUrlService);
}

describe('MediaUrlService', () => {
  it('builds unsigned URLs when the deployment does not sign', async () => {
    const service = await buildService({ cdnUrl: 'https://cdn.genfeed.ai' });

    expect(service.buildUrl('ingredients/images/abc')).toBe(
      'https://cdn.genfeed.ai/ingredients/images/abc',
    );
    expect(
      service.buildUrlFromAbsolute(
        'https://cdn.genfeed.ai/ingredients/images/abc',
      ),
    ).toBe('https://cdn.genfeed.ai/ingredients/images/abc');
  });

  it('signs with the deployment key pair when configured', async () => {
    const service = await buildService({
      cdnUrl: 'https://cdn.genfeed.ai',
      signing: { keyPairId: 'KEYPAIR', privateKey, ttlSeconds: 300 },
    });

    for (const url of [
      service.buildUrl('ingredients/images/abc'),
      service.buildUrlFromAbsolute(
        'https://cdn.genfeed.ai/ingredients/images/abc',
      ),
    ]) {
      const parsed = new URL(url);
      expect(parsed.pathname).toBe('/ingredients/images/abc');
      expect(parsed.searchParams.get('Key-Pair-Id')).toBe('KEYPAIR');
      expect(parsed.searchParams.get('Signature')).toBeTruthy();
    }
  });

  it('leaves public-by-design media and other origins unsigned', async () => {
    const service = await buildService({
      cdnUrl: 'https://cdn.genfeed.ai',
      signing: { keyPairId: 'KEYPAIR', privateKey, ttlSeconds: 300 },
    });

    expect(
      service.buildUrl('assets/agents/a.webp', { isSignable: false }),
    ).toBe('https://cdn.genfeed.ai/assets/agents/a.webp');
    expect(
      service.buildUrlFromAbsolute('https://replicate.delivery/a.png'),
    ).toBe('https://replicate.delivery/a.png');
  });
});

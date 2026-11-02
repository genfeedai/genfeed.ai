import { generateKeyPairSync } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { MediaDeliveryResponseInterceptor } from '@api/services/media-urls/media-delivery-response.interceptor';
import type { ConfigService } from '@libs/config/config.service';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { format: 'pem', type: 'pkcs1' },
  publicKeyEncoding: { format: 'pem', type: 'spki' },
});

const AVATAR = 'https://cdn.genfeed.ai/ingredients/social-avatars/cred-1';

function createInterceptor(
  publicBrandAssets: { assetId: string; url: string | null }[] = [],
): MediaDeliveryResponseInterceptor {
  const issuer = {
    projectAssets: async () => [],
    projectIngredients: async () => [],
    projectPublicBrandAssets: async () => publicBrandAssets,
    projectPublicIngredients: async () => [],
  } as unknown as AuthorizedMediaUrlService;
  const config = {
    isAuthorizedMediaDeliveryEnabled: true,
    mediaUrlConfig: {
      cdnUrl: 'https://cdn.genfeed.ai',
      signing: { keyPairId: 'KEYPAIR', privateKey, ttlSeconds: 900 },
    },
  } as unknown as ConfigService;
  return new MediaDeliveryResponseInterceptor(issuer, config);
}

async function respond(
  response: unknown,
  user?: Partial<AuthenticatedUser>,
  publicBrandAssets: { assetId: string; url: string | null }[] = [],
): Promise<unknown> {
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of(response) };
  return lastValueFrom(
    createInterceptor(publicBrandAssets).intercept(context, next),
  );
}

describe('MediaDeliveryResponseInterceptor social avatars', () => {
  it('signs the mirrored avatar CDN URL on an organization response', async () => {
    const result = (await respond(
      { data: { attributes: { externalAvatar: AVATAR }, id: 'cred-1' } },
      { id: 'user-1', organizationId: 'org-1' },
    )) as { data: { attributes: { externalAvatar: string } } };

    const signed = new URL(result.data.attributes.externalAvatar);
    expect(`${signed.origin}${signed.pathname}`).toBe(AVATAR);
    expect(signed.searchParams.get('Key-Pair-Id')).toBe('KEYPAIR');
    expect(signed.searchParams.get('Signature')).toBeTruthy();
    expect(signed.searchParams.get('Expires')).toBeTruthy();
  });

  it('signs it on a public response too, since the prefix only holds profile photos', async () => {
    const result = (await respond({ avatarUrl: AVATAR })) as {
      avatarUrl: string;
    };
    expect(
      new URL(result.avatarUrl).searchParams.get('Signature'),
    ).toBeTruthy();
  });

  it('leaves provider-hosted avatars untouched', async () => {
    const provider = 'https://pbs.twimg.com/profile_images/1/a.jpg';
    expect(await respond({ externalAvatar: provider })).toEqual({
      externalAvatar: provider,
    });
  });
});

describe('MediaDeliveryResponseInterceptor public brand profile', () => {
  const publicBrand = {
    data: {
      attributes: { slug: 'genfeedai' },
      id: 'brand-1',
      relationships: { logo: { data: { id: 'logo-1', type: 'asset' } } },
      type: 'brand',
    },
    included: [
      {
        attributes: {
          category: 'LOGO',
          cdnUrl: 'https://cdn.genfeed.ai/logos/logo-1',
        },
        id: 'logo-1',
        type: 'asset',
      },
    ],
  };

  it('gives an anonymous visitor the signed logo of a public brand', async () => {
    const result = (await respond(publicBrand, undefined, [
      {
        assetId: 'logo-1',
        url: 'https://cdn.genfeed.ai/logos/logo-1?Signature=s',
      },
    ])) as { included: { attributes: { cdnUrl: string | null } }[] };

    expect(result.included[0].attributes.cdnUrl).toBe(
      'https://cdn.genfeed.ai/logos/logo-1?Signature=s',
    );
  });

  it('withholds the logo when the brand is not public instead of leaving it unsigned', async () => {
    const result = (await respond(publicBrand, undefined, [
      { assetId: 'logo-1', url: null },
    ])) as { included: { attributes: { cdnUrl: string | null } }[] };

    expect(result.included[0].attributes.cdnUrl).toBeNull();
  });
});

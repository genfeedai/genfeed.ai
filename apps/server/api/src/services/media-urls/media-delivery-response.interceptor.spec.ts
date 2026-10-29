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

function createInterceptor(): MediaDeliveryResponseInterceptor {
  const issuer = {
    projectAssets: async () => [],
    projectIngredients: async () => [],
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
): Promise<unknown> {
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of(response) };
  return lastValueFrom(createInterceptor().intercept(context, next));
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

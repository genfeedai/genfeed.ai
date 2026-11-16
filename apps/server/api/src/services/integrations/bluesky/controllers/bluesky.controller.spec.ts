vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((payload: Record<string, string>) => ({
    errors: [payload],
  })),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { BlueskyController } from '@api/services/integrations/bluesky/controllers/bluesky.controller';
import { BlueskyService } from '@api/services/integrations/bluesky/services/bluesky.service';
import {
  ApiKeyConnectErrorCode,
  CredentialPlatform,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import type { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const brand = { id: 'brand-1', organizationId: 'org-1' };
const user = { organizationId: 'org-1', userId: 'user-1' } as unknown as User;
const request = {} as Request;
// Built at runtime so no credential-shaped literal sits in the source.
const APP_CREDENTIAL = ['aaaa', 'bbbb', 'cccc', 'dddd'].join('-');
const REFUSED_CREDENTIAL = ['refused', 'value'].join('-');

function axiosLikeError(status: number): Error {
  return Object.assign(new Error('request failed'), {
    isAxiosError: true,
    response: { data: { error: 'AuthenticationRequired' }, status },
  });
}

describe('BlueskyController', () => {
  let controller: BlueskyController;
  let createSession: ReturnType<typeof vi.fn>;
  let findOne: ReturnType<typeof vi.fn>;
  let createPendingForBrand: ReturnType<typeof vi.fn>;
  let connectAccount: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createSession = vi.fn().mockResolvedValue({
      accessJwt: 'jwt',
      did: 'did:plc:abc123',
      handle: 'alice.bsky.social',
      serviceUrl: 'https://bsky.social',
    });
    findOne = vi.fn().mockResolvedValue(brand);
    createPendingForBrand = vi.fn().mockResolvedValue({ id: 'pending-1' });
    connectAccount = vi
      .fn()
      .mockResolvedValue({ id: 'pending-1', platform: 'BLUESKY' });

    const module = await Test.createTestingModule({
      controllers: [BlueskyController],
      providers: [
        {
          provide: BlueskyService,
          useValue: {
            createSession,
            getPublicProfile: vi.fn().mockResolvedValue({
              avatar: 'https://cdn.bsky.app/avatar.jpg',
              displayName: 'Alice',
            }),
          },
        },
        { provide: BrandsService, useValue: { findOne } },
        {
          provide: CredentialsService,
          useValue: { connectAccount, createPendingForBrand },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();
    controller = module.get(BlueskyController);
  });

  it('connects an account and stores the app password with its server', async () => {
    const result = await controller.connect(request, user, {
      appPassword: ` ${APP_CREDENTIAL} `,
      brandId: 'brand-1',
      handle: '@Alice.Bsky.Social',
    });

    expect(createSession).toHaveBeenCalledWith(
      'https://bsky.social',
      'alice.bsky.social',
      APP_CREDENTIAL,
    );
    expect(createPendingForBrand).toHaveBeenCalledWith(
      brand,
      'user-1',
      CredentialPlatform.BLUESKY,
    );
    expect(connectAccount).toHaveBeenCalledWith(
      'pending-1',
      'org-1',
      {
        avatarUrl: 'https://cdn.bsky.app/avatar.jpg',
        bannerUrl: undefined,
        handle: 'alice.bsky.social',
        id: 'did:plc:abc123',
        name: 'Alice',
      },
      {
        accessToken: APP_CREDENTIAL,
        description: 'https://bsky.social',
        isConnected: true,
        isDeleted: false,
      },
    );
    expect(result).toEqual({
      data: { id: 'pending-1', platform: 'BLUESKY' },
    });
  });

  it('uses the server address a self-hosted account supplies', async () => {
    await controller.connect(request, user, {
      appPassword: APP_CREDENTIAL,
      brandId: 'brand-1',
      handle: 'alice.example.com',
      serviceUrl: 'pds.example.com',
    });

    expect(createSession).toHaveBeenCalledWith(
      'https://pds.example.com',
      'alice.example.com',
      APP_CREDENTIAL,
    );
  });

  it('answers key_rejected when Bluesky refuses the handle or password', async () => {
    createSession.mockRejectedValue(axiosLikeError(401));

    const failure = await controller
      .connect(request, user, {
        appPassword: REFUSED_CREDENTIAL,
        brandId: 'brand-1',
        handle: 'alice.bsky.social',
      })
      .catch((error: HttpException) => error);

    expect((failure as HttpException).getResponse()).toMatchObject({
      code: ApiKeyConnectErrorCode.KEY_REJECTED,
    });
    expect(createPendingForBrand).not.toHaveBeenCalled();
  });

  it('answers https_required for an http server address before any request', async () => {
    const failure = await controller
      .connect(request, user, {
        appPassword: APP_CREDENTIAL,
        brandId: 'brand-1',
        handle: 'alice.example.com',
        serviceUrl: 'http://pds.example.com',
      })
      .catch((error: HttpException) => error);

    expect((failure as HttpException).getResponse()).toMatchObject({
      code: ApiKeyConnectErrorCode.HTTPS_REQUIRED,
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('refuses a brand the caller cannot access', async () => {
    findOne.mockResolvedValue(null);

    const result = await controller.connect(request, user, {
      appPassword: APP_CREDENTIAL,
      brandId: 'brand-1',
      handle: 'alice.bsky.social',
    });

    expect(result).toEqual({
      errors: [
        {
          detail: 'You do not have access to this brand',
          title: 'Invalid payload',
        },
      ],
    });
    expect(createSession).not.toHaveBeenCalled();
  });
});

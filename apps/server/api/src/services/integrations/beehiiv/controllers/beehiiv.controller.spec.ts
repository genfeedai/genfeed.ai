vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((payload: Record<string, string>) => ({
    errors: [payload],
  })),
  returnInternalServerError: vi.fn((msg: string) => ({
    errors: [{ detail: msg }],
  })),
  returnUnauthorized: vi.fn((msg: string) => ({
    errors: [{ detail: msg }],
  })),
  serializeCollection: vi.fn(
    (_req: unknown, _serializer: unknown, data: { docs?: unknown }) =>
      data.docs || data,
  ),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { TENANT_READ_POLICY } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { getTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { BeehiivController } from '@api/services/integrations/beehiiv/controllers/beehiiv.controller';
import { BeehiivService } from '@api/services/integrations/beehiiv/services/beehiiv.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { getTenantContext } from '@libs/prisma/tenant-context';
import {
  type ExecutionContext,
  ForbiddenException,
  RequestMethod,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { defer, firstValueFrom } from 'rxjs';

describe('BeehiivController', () => {
  let controller: BeehiivController;
  let beehiivService: {
    listPublications: ReturnType<typeof vi.fn>;
    getDecryptedApiKey: ReturnType<typeof vi.fn>;
    getSubscribers: ReturnType<typeof vi.fn>;
    createSubscribers: ReturnType<typeof vi.fn>;
  };
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let credentialsService: {
    createPendingForBrand: ReturnType<typeof vi.fn>;
    updateExternalProfile: ReturnType<typeof vi.fn>;
  };

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;

  const mockUser = {
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;

  const mockRequest = {} as unknown as Request;

  const mockBrand = {
    id: testId('brand'),
    organizationId: testId('org'),
  };

  const mockPublication = {
    created: 1_700_000_000,
    description: 'Test newsletter',
    id: 'pub_abc123',
    name: 'My Newsletter',
    url: 'https://newsletter.beehiiv.com',
  };
  const alternatePublication = {
    created: 1_700_000_002,
    description: 'Second newsletter',
    id: 'pub_selected',
    name: 'Selected Newsletter',
    url: 'https://selected.beehiiv.com',
  };

  beforeEach(async () => {
    beehiivService = {
      createSubscribers: vi.fn(),
      getDecryptedApiKey: vi.fn(),
      getSubscribers: vi.fn(),
      listPublications: vi.fn(),
    };
    brandsService = { findOne: vi.fn() };
    credentialsService = {
      createPendingForBrand: vi
        .fn()
        .mockResolvedValue({ id: 'pending-credential-id' }),
      updateExternalProfile: vi.fn().mockResolvedValue({
        id: 'test-object-id',
        platform: CredentialPlatform.BEEHIIV,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BeehiivController],
      providers: [
        { provide: BeehiivService, useValue: beehiivService },
        { provide: BrandsService, useValue: brandsService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<BeehiivController>(BeehiivController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('original owner read boundary', () => {
    const routes = [
      { handler: 'listPublications', path: 'publications' },
      { handler: 'getSubscribers', path: 'subscribers' },
    ] as const;
    const owner: User = {
      id: testId('user'),
      userId: testId('user'),
      organizationId: testId('org'),
      brandId: testId('brand'),
      isSuperAdmin: true,
    };
    const credentialId = testId('credential');
    const subscriberData = {
      data: [{ id: 'sub_owner', email: 'owner@example.com' }],
      total_results: 1,
    };
    const interceptor = new TenantContextInterceptor(new Reflector());

    function run(
      handler: (typeof routes)[number]['handler'],
      query: Record<string, unknown>,
      actor = owner,
      context = { ...actor },
      page: string | undefined = '2',
      limit: string | undefined = '30',
    ) {
      const request = { method: 'GET', query, user: actor, context };
      const handlerCall = vi.fn(() =>
        handler === 'listPublications'
          ? controller.listPublications(actor, testId('brand'), credentialId)
          : controller.getSubscribers(
              actor,
              testId('brand'),
              page,
              limit,
              credentialId,
            ),
      );
      const execution = {
        getClass: () => BeehiivController,
        getHandler: () => BeehiivController.prototype[handler],
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      const next = { handle: vi.fn(() => defer(() => handlerCall())) };
      return {
        request,
        next,
        handlerCall,
        execute: async () =>
          firstValueFrom(interceptor.intercept(execution, next)),
      };
    }

    function expectNoOwnerWork() {
      expect(beehiivService.getDecryptedApiKey).not.toHaveBeenCalled();
      expect(beehiivService.listPublications).not.toHaveBeenCalled();
      expect(beehiivService.getSubscribers).not.toHaveBeenCalled();
      expect(beehiivService.createSubscribers).not.toHaveBeenCalled();
      expect(brandsService.findOne).not.toHaveBeenCalled();
      expect(credentialsService.createPendingForBrand).not.toHaveBeenCalled();
      expect(credentialsService.updateExternalProfile).not.toHaveBeenCalled();
    }

    beforeEach(() => {
      beehiivService.getDecryptedApiKey.mockImplementation(async () => {
        expect(getTenantContext()?.organizationId).toBe(owner.organizationId);
        expect(getTenantReadScope()).toBeUndefined();
        return {
          apiKey: 'synthetic-owner-key',
          publicationId: mockPublication.id,
        };
      });
      beehiivService.listPublications.mockResolvedValue([mockPublication]);
      beehiivService.getSubscribers.mockResolvedValue(subscriberData);
    });

    it.each(routes)(
      'marks the actual $handler GET as owner',
      ({ handler, path }) => {
        const actual = BeehiivController.prototype[handler];
        expect(Reflect.getMetadata(TENANT_READ_POLICY, actual)).toBe('owner');
        expect(Reflect.getMetadata(METHOD_METADATA, actual)).toBe(
          RequestMethod.GET,
        );
        expect(Reflect.getMetadata(PATH_METADATA, actual)).toBe(path);
        expect(Reflect.getMetadata(PATH_METADATA, BeehiivController)).toBe(
          'services/beehiiv',
        );
      },
    );

    for (const actor of [
      { name: 'superadmin', user: owner, context: { ...owner } },
      {
        name: 'member',
        user: { ...owner, isSuperAdmin: false },
        context: { ...owner, isSuperAdmin: false },
      },
      {
        name: 'IP-unverified superadmin',
        user: owner,
        context: { ...owner, isSuperAdmin: false },
      },
    ]) {
      it.each(routes)(
        `rejects foreign selection for ${actor.name} before $handler`,
        async ({ handler }) => {
          const fixture = run(
            handler,
            {
              organizationId: testId('org', 2),
              brandId: testId('brand'),
              credentialId,
            },
            actor.user,
            actor.context,
          );
          const before = structuredClone(fixture.request);
          await expect(fixture.execute()).rejects.toBeInstanceOf(
            ForbiddenException,
          );
          expect(fixture.next.handle).not.toHaveBeenCalled();
          expect(fixture.handlerCall).not.toHaveBeenCalled();
          expectNoOwnerWork();
          expect(fixture.request.user).toBe(actor.user);
          expect(fixture.request.context).toBe(actor.context);
          expect(fixture.request).toEqual(before);
        },
      );
    }

    for (const selector of [
      { name: 'malformed', value: 'not-an-entity' },
      { name: 'array', value: [testId('org', 2)] },
    ]) {
      it.each(routes)(
        `rejects ${selector.name} selection before $handler`,
        async ({ handler }) => {
          const fixture = run(handler, { organizationId: selector.value });
          await expect(fixture.execute()).rejects.toBeInstanceOf(
            ForbiddenException,
          );
          expect(fixture.next.handle).not.toHaveBeenCalled();
          expect(fixture.handlerCall).not.toHaveBeenCalled();
          expectNoOwnerWork();
        },
      );
    }

    for (const selection of [
      { name: 'no', query: {} },
      { name: 'equal', query: { organizationId: owner.organizationId } },
    ]) {
      it.each(routes)(
        `preserves original credentials and provider arguments for ${selection.name} selection in $handler`,
        async ({ handler }) => {
          const fixture = run(handler, selection.query);
          const originalContext = fixture.request.context;
          const before = structuredClone(fixture.request);
          const result = await fixture.execute();
          expect(fixture.next.handle).toHaveBeenCalledOnce();
          expect(fixture.handlerCall).toHaveBeenCalledOnce();
          expect(fixture.request.user).toBe(owner);
          expect(fixture.request.context).toBe(originalContext);
          expect(fixture.request).toEqual(before);
          expect(
            beehiivService.getDecryptedApiKey,
          ).toHaveBeenCalledExactlyOnceWith(
            owner.organizationId,
            testId('brand'),
            credentialId,
          );
          if (handler === 'listPublications') {
            expect(
              beehiivService.listPublications,
            ).toHaveBeenCalledExactlyOnceWith('synthetic-owner-key');
            expect(beehiivService.getSubscribers).not.toHaveBeenCalled();
            expect(result).toEqual({ data: [mockPublication] });
          } else {
            expect(
              beehiivService.getSubscribers,
            ).toHaveBeenCalledExactlyOnceWith(
              'synthetic-owner-key',
              mockPublication.id,
              2,
              30,
            );
            expect(beehiivService.listPublications).not.toHaveBeenCalled();
            expect(result).toEqual({ data: subscriberData });
          }
        },
      );

      it(`preserves subscriber page/limit defaults for ${selection.name} selection`, async () => {
        const fixture = run(
          'getSubscribers',
          selection.query,
          owner,
          { ...owner },
          '',
          '',
        );
        await fixture.execute();
        expect(beehiivService.getSubscribers).toHaveBeenCalledExactlyOnceWith(
          'synthetic-owner-key',
          mockPublication.id,
          undefined,
          undefined,
        );
      });
    }

    it.each(routes)(
      'preserves missing-session-org behavior for $handler',
      async ({ handler }) => {
        const actor = { ...owner, organizationId: undefined };
        beehiivService.getDecryptedApiKey.mockImplementation(async () => {
          expect(getTenantContext()).toBeUndefined();
          expect(getTenantReadScope()).toBeUndefined();
          throw new Error('Credential not found');
        });
        const fixture = run(handler, {}, actor, { ...actor });
        await expect(fixture.execute()).resolves.toEqual({
          errors: [
            {
              detail:
                handler === 'listPublications'
                  ? 'Failed to list Beehiiv publications'
                  : 'Failed to get Beehiiv subscribers',
            },
          ],
        });
        expect(
          beehiivService.getDecryptedApiKey,
        ).toHaveBeenCalledExactlyOnceWith('', testId('brand'), credentialId);
        expect(fixture.handlerCall).toHaveBeenCalledOnce();
      },
    );

    it.each(routes)(
      'preserves safe provider error results for $handler',
      async ({ handler }) => {
        const provider =
          handler === 'listPublications'
            ? beehiivService.listPublications
            : beehiivService.getSubscribers;
        provider.mockRejectedValue(new Error('Provider unavailable'));
        const fixture = run(handler, {});
        await expect(fixture.execute()).resolves.toEqual({
          errors: [
            {
              detail:
                handler === 'listPublications'
                  ? 'Failed to list Beehiiv publications'
                  : 'Failed to get Beehiiv subscribers',
            },
          ],
        });
        expect(loggerMock.error).toHaveBeenCalledWith(
          expect.stringContaining('failed'),
          { error: 'Provider unavailable' },
        );
      },
    );
  });

  describe('connect', () => {
    it('should connect successfully with valid apiKey and brandId', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      beehiivService.listPublications.mockResolvedValue([mockPublication]);
      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: testId('brand'),
      });

      expect(beehiivService.listPublications).toHaveBeenCalledWith(
        'test-api-key',
      );
      expect(credentialsService.createPendingForBrand).toHaveBeenCalledWith(
        mockBrand,
        testId('user'),
        CredentialPlatform.BEEHIIV,
        { accessToken: 'test-api-key' },
      );
      // Beehiiv publications have a display name, not a public @handle.
      expect(credentialsService.updateExternalProfile).toHaveBeenCalledWith(
        'pending-credential-id',
        mockBrand.organizationId,
        {
          handle: undefined,
          id: mockPublication.id,
          name: mockPublication.name,
        },
      );
      expect(result).toHaveProperty('data');
    });

    it('should connect to the selected publication when publicationId is provided', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      beehiivService.listPublications.mockResolvedValue([
        mockPublication,
        alternatePublication,
      ]);
      await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: testId('brand'),
        publicationId: 'pub_selected',
      });

      expect(credentialsService.updateExternalProfile).toHaveBeenCalledWith(
        'pending-credential-id',
        mockBrand.organizationId,
        {
          handle: undefined,
          id: alternatePublication.id,
          name: alternatePublication.name,
        },
      );
    });

    it('should return bad request when selected publication is not available', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      beehiivService.listPublications.mockResolvedValue([mockPublication]);

      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: testId('brand'),
        publicationId: 'pub_missing',
      });

      expect(result).toHaveProperty('errors');
      expect(credentialsService.createPendingForBrand).not.toHaveBeenCalled();
    });

    it('should return bad request when apiKey is missing', async () => {
      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: '',
        brandId: testId('brand'),
      });

      expect(result).toHaveProperty('errors');
      expect(brandsService.findOne).not.toHaveBeenCalled();
    });

    it('should return bad request when brandId is missing', async () => {
      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: '',
      });

      expect(result).toHaveProperty('errors');
    });

    it('should return bad request when brand is not found', async () => {
      brandsService.findOne.mockResolvedValue(null);

      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: testId('brand'),
      });

      expect(result).toHaveProperty('errors');
      expect(beehiivService.listPublications).not.toHaveBeenCalled();
    });

    it('should return bad request when no publications found', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      beehiivService.listPublications.mockResolvedValue([]);

      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: testId('brand'),
      });

      expect(result).toHaveProperty('errors');
      expect(credentialsService.createPendingForBrand).not.toHaveBeenCalled();
    });

    it('should return internal server error when listPublications throws', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      beehiivService.listPublications.mockRejectedValue(
        new Error('Beehiiv API down'),
      );

      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'bad-key',
        brandId: testId('brand'),
      });

      expect(result).toHaveProperty('errors');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('listPublications', () => {
    it('should return publications for a valid brandId', async () => {
      beehiivService.getDecryptedApiKey.mockResolvedValue({
        apiKey: 'decrypted-key',
        publicationId: 'pub_abc123',
      });
      beehiivService.listPublications.mockResolvedValue([mockPublication]);

      const result = await controller.listPublications(
        mockUser,
        testId('brand'),
      );

      expect(result).toEqual({ data: [mockPublication] });
    });

    it('should return bad request when brandId is empty', async () => {
      const result = await controller.listPublications(mockUser, '');

      expect(result).toHaveProperty('errors');
    });

    it('should return internal server error when service throws', async () => {
      beehiivService.getDecryptedApiKey.mockRejectedValue(
        new Error('Credential not found'),
      );

      const result = await controller.listPublications(
        mockUser,
        testId('brand'),
      );

      expect(result).toHaveProperty('errors');
    });
  });

  describe('getSubscribers', () => {
    it('should return subscribers for a valid brandId', async () => {
      beehiivService.getDecryptedApiKey.mockResolvedValue({
        apiKey: 'decrypted-key',
        publicationId: 'pub_abc123',
      });
      beehiivService.getSubscribers.mockResolvedValue({
        data: [{ email: 'sub@example.com', id: 'sub_1' }],
        total_results: 1,
      });

      const result = await controller.getSubscribers(
        mockUser,
        testId('brand'),
        '1',
        '20',
      );

      expect(beehiivService.getSubscribers).toHaveBeenCalledWith(
        'decrypted-key',
        'pub_abc123',
        1,
        20,
      );
      expect(result).toHaveProperty('data');
    });

    it('should return bad request when brandId is missing', async () => {
      const result = await controller.getSubscribers(mockUser, '');

      expect(result).toHaveProperty('errors');
    });

    it('should handle missing page and limit gracefully', async () => {
      beehiivService.getDecryptedApiKey.mockResolvedValue({
        apiKey: 'decrypted-key',
        publicationId: 'pub_abc123',
      });
      beehiivService.getSubscribers.mockResolvedValue({
        data: [],
        total_results: 0,
      });

      await controller.getSubscribers(mockUser, testId('brand'));

      expect(beehiivService.getSubscribers).toHaveBeenCalledWith(
        'decrypted-key',
        'pub_abc123',
        undefined,
        undefined,
      );
    });
  });

  describe('createSubscribers', () => {
    it('returns a serialized outcome for every submitted address', async () => {
      beehiivService.getDecryptedApiKey.mockResolvedValue({
        apiKey: 'decrypted-key',
        publicationId: 'pub_abc123',
      });
      beehiivService.createSubscribers.mockResolvedValue([
        {
          email: 'new@example.com',
          id: 'new@example.com',
          status: 'active',
          subscriberId: 'sub_new',
          success: true,
        },
        {
          email: 'rejected@example.com',
          errorCode: 'validation_failed',
          errorMessage: 'Beehiiv rejected the request payload.',
          id: 'rejected@example.com',
          isRetryable: false,
          success: false,
        },
      ]);

      const result = await controller.createSubscribers(mockRequest, mockUser, {
        brandId: testId('brand'),
        emails: ['new@example.com', 'rejected@example.com'],
        utmSource: 'twitter',
      });

      expect(beehiivService.createSubscribers).toHaveBeenCalledWith(
        'decrypted-key',
        'pub_abc123',
        ['new@example.com', 'rejected@example.com'],
        'twitter',
      );
      expect(result).toHaveLength(2);
    });

    it('should return internal server error when service throws', async () => {
      beehiivService.getDecryptedApiKey.mockRejectedValue(
        new Error('No credential'),
      );

      const result = await controller.createSubscribers(mockRequest, mockUser, {
        brandId: testId('brand'),
        emails: ['new@example.com'],
      });

      expect(result).toEqual({
        errors: [{ detail: 'Failed to create Beehiiv subscribers' }],
      });
    });
  });
});

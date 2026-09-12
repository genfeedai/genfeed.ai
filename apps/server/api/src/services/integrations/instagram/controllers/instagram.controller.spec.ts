vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((payload: Record<string, string>) => ({
    errors: [payload],
  })),
  returnInternalServerError: vi.fn((msg: string) => ({
    errors: [{ detail: msg }],
  })),
  returnNotFound: vi.fn((type: string, id: string) => ({
    errors: [{ detail: `${type} ${id} not found` }],
  })),
  serializeCollection: vi.fn(
    (_req: unknown, _serializer: unknown, data: { docs?: unknown }) =>
      data.docs || data,
  ),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => value),
    encrypt: vi.fn((value: string) => value),
  },
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SocialSourceHistoryImportService } from '@api/collections/social-sources/services/social-source-history-import.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { InstagramController } from '@api/services/integrations/instagram/controllers/instagram.controller';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { InstagramAuthorizedSignalsService } from '@api/services/integrations/instagram/services/instagram-authorized-signals.service';
import { InstagramConnectionResolverService } from '@api/services/integrations/instagram/services/instagram-connection-resolver.service';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { of, throwError } from 'rxjs';

const instagramBrandId = testId('brand');
const instagramOrganizationId = testId('org');
const instagramUserId = testId('user');
const GRANTED_SCOPE_WITH_PAGES =
  'business_management,instagram_basic,pages_show_list,instagram_content_publish';

async function captureHttpException(
  action: Promise<unknown>,
): Promise<HttpException> {
  try {
    await action;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    return error as HttpException;
  }

  throw new Error('Expected an HttpException');
}

/** A Graph `me/accounts` candidate carrying an IG professional account. */
function igAccount(overrides: {
  id: string;
  label?: string;
  username?: string;
  image?: string;
}) {
  return {
    id: overrides.id,
    image: overrides.image ?? `https://cdn.example.com/${overrides.id}.jpg`,
    label: overrides.label ?? `Account ${overrides.id}`,
    platform: 'instagram',
    username: overrides.username ?? overrides.id,
  };
}

describe('InstagramController', () => {
  let controller: InstagramController;
  let brandsFindOneMock: ReturnType<typeof vi.fn>;
  let credentialsBeginOAuthForBrandMock: ReturnType<typeof vi.fn>;
  let credentialsFindPendingOAuthCredentialMock: ReturnType<typeof vi.fn>;
  let credentialsPatchMock: ReturnType<typeof vi.fn>;
  let credentialsResolveBrandAccountMock: ReturnType<typeof vi.fn>;
  let credentialsFindConnectedAccountsMock: ReturnType<typeof vi.fn>;
  let httpGetMock: ReturnType<typeof vi.fn>;
  let httpPostMock: ReturnType<typeof vi.fn>;
  let credentialsFindOneMock: ReturnType<typeof vi.fn>;
  let credentialsUpdateExternalProfileMock: ReturnType<typeof vi.fn>;
  let instagramServiceMock: {
    listAuthorizedInstagramAccounts: ReturnType<typeof vi.fn>;
    getTrends: ReturnType<typeof vi.fn>;
  };
  let instagramAuthorizedSignalsServiceMock: {
    refresh: ReturnType<typeof vi.fn>;
  };
  let historyImportServiceMock: {
    scheduleForCredential: ReturnType<typeof vi.fn>;
  };

  const instagramConfig: Record<string, string> = {
    INSTAGRAM_API_VERSION: 'v18.0',
    INSTAGRAM_APP_ID: 'test_app_id',
    INSTAGRAM_APP_SECRET: 'test_app_secret',
    INSTAGRAM_GRAPH_URL: 'https://graph.facebook.com',
    INSTAGRAM_REDIRECT_URI: 'https://app.genfeed.ai/oauth/instagram',
  };

  const configMock = {
    get: vi.fn((key: string) => instagramConfig[key]),
  } as unknown as ConfigService;

  const loggerErrorMock = vi.fn();
  const loggerLogMock = vi.fn();
  const loggerWarnMock = vi.fn();
  const loggerMock = {
    error: loggerErrorMock,
    log: loggerLogMock,
    warn: loggerWarnMock,
  } as unknown as LoggerService;

  beforeEach(() => {
    vi.clearAllMocks();

    brandsFindOneMock = vi.fn();
    credentialsBeginOAuthForBrandMock = vi.fn().mockResolvedValue({
      credential: { id: 'test-object-id' },
      state: 'opaque-oauth-state',
    });
    credentialsFindPendingOAuthCredentialMock = vi.fn().mockResolvedValue({
      brandId: instagramBrandId,
      id: 'test-object-id',
      organizationId: instagramOrganizationId,
      userId: instagramUserId,
      warmupSignals: {},
    });
    credentialsFindOneMock = vi.fn();
    credentialsPatchMock = vi.fn();
    credentialsUpdateExternalProfileMock = vi.fn();
    credentialsResolveBrandAccountMock = vi.fn().mockResolvedValue(null);
    credentialsFindConnectedAccountsMock = vi.fn().mockResolvedValue([]);
    httpGetMock = vi.fn();
    httpPostMock = vi.fn();
    instagramServiceMock = {
      getTrends: vi.fn(),
      listAuthorizedInstagramAccounts: vi
        .fn()
        .mockResolvedValue([igAccount({ id: 'ig-account-id' })]),
    };
    instagramAuthorizedSignalsServiceMock = {
      refresh: vi.fn().mockResolvedValue({ state: 'full' }),
    };
    historyImportServiceMock = {
      scheduleForCredential: vi
        .fn()
        .mockResolvedValue({ sourceId: 'source-1', status: 'scheduled' }),
    };

    const accountsMock = {
      findOne: brandsFindOneMock,
    } as unknown as BrandsService;

    const credentialsMock = {
      beginOAuthForBrand: credentialsBeginOAuthForBrandMock,
      findConnectedAccounts: credentialsFindConnectedAccountsMock,
      findOne: credentialsFindOneMock,
      findPendingOAuthCredential: credentialsFindPendingOAuthCredentialMock,
      patch: credentialsPatchMock,
      resolveBrandAccount: credentialsResolveBrandAccountMock,
      updateExternalProfile: credentialsUpdateExternalProfileMock,
    } as unknown as CredentialsService;

    const httpServiceMock = {
      get: httpGetMock,
      post: httpPostMock,
    } as unknown as HttpService;

    const connectionResolver = new InstagramConnectionResolverService(
      configMock,
      credentialsMock,
      httpServiceMock,
      instagramServiceMock as unknown as InstagramService,
      instagramAuthorizedSignalsServiceMock as unknown as InstagramAuthorizedSignalsService,
      historyImportServiceMock as unknown as SocialSourceHistoryImportService,
      loggerMock,
    );

    controller = new InstagramController(
      configMock,
      accountsMock,
      credentialsMock,
      instagramServiceMock as unknown as InstagramService,
      instagramAuthorizedSignalsServiceMock as unknown as InstagramAuthorizedSignalsService,
      connectionResolver,
      loggerMock,
    );
  });

  describe('connect', () => {
    const mockUser = {
      organizationId: instagramOrganizationId,
      userId: instagramUserId,
    } as unknown as User;
    const mockRequest = {
      headers: { host: 'localhost:3010' },
      protocol: 'http',
      url: '/services/instagram/connect',
    } as unknown as Request;
    const brandOid = instagramBrandId;

    it('should generate Instagram OAuth URL for brand connection', async () => {
      const mockBrand = {
        id: brandOid,
        organizationId: instagramOrganizationId,
        userId: instagramUserId,
      };
      brandsFindOneMock.mockResolvedValue(mockBrand);

      const result = await controller.connect(mockRequest, mockUser, {
        brandId: brandOid,
      });

      expect(brandsFindOneMock).toHaveBeenCalledWith({
        id: brandOid,
        organizationId: instagramOrganizationId,
      });
      expect(credentialsBeginOAuthForBrandMock).toHaveBeenCalledWith(
        mockBrand,
        instagramUserId,
        'instagram',
        expect.objectContaining({ isConnected: false }),
        undefined,
      );
      expect(result).toHaveProperty('data');
      const data = result.data as unknown as { url: string };
      expect(data).toHaveProperty('url');
      expect(data.url).toContain('facebook.com');
      expect(data.url).toContain('oauth');
    });

    it('refuses to start OAuth when the app id is a placeholder', async () => {
      brandsFindOneMock.mockResolvedValue({
        id: brandOid,
        organizationId: instagramOrganizationId,
        userId: instagramUserId,
      });
      (configMock.get as ReturnType<typeof vi.fn>).mockImplementation(
        (key: string) =>
          ({
            ...instagramConfig,
            INSTAGRAM_APP_ID: 'PLACEHOLDER_NOT_CONFIGURED',
          })[key],
      );

      await expect(
        controller.connect(mockRequest, mockUser, { brandId: brandOid }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(credentialsBeginOAuthForBrandMock).not.toHaveBeenCalled();

      (configMock.get as ReturnType<typeof vi.fn>).mockImplementation(
        (key: string) => instagramConfig[key],
      );
    });

    it('should return bad request for invalid brand', async () => {
      brandsFindOneMock.mockResolvedValue(null);

      const result = await controller.connect(mockRequest, mockUser, {
        brandId: brandOid,
      });

      expect(result).toHaveProperty('errors');
      expect(brandsFindOneMock).toHaveBeenCalled();
    });

    it('should include correct scopes in auth URL', async () => {
      brandsFindOneMock.mockResolvedValue({
        id: brandOid,
        organizationId: instagramOrganizationId,
        userId: instagramUserId,
      });

      const result = await controller.connect(mockRequest, mockUser, {
        brandId: brandOid,
      });

      const url = (result.data as unknown as { url: string }).url;
      expect(url).toContain('instagram_basic');
      expect(url).toContain('instagram_content_publish');
    });

    it('should include only the opaque server-issued state', async () => {
      brandsFindOneMock.mockResolvedValue({
        id: brandOid,
        organizationId: instagramOrganizationId,
        userId: instagramUserId,
      });
      const result = await controller.connect(mockRequest, mockUser, {
        brandId: brandOid,
      });

      const url = (result.data as unknown as { url: string }).url;
      expect(new URL(url).searchParams.get('state')).toBe('opaque-oauth-state');
      expect(url).not.toContain(brandOid);
      expect(url).not.toContain(instagramOrganizationId);
    });

    it('validates a reconnect credentialId belongs to this brand and forwards it', async () => {
      const mockBrand = {
        id: brandOid,
        organizationId: instagramOrganizationId,
        userId: instagramUserId,
      };
      brandsFindOneMock.mockResolvedValue(mockBrand);
      credentialsResolveBrandAccountMock.mockResolvedValue({
        externalId: 'ig-account-id',
        id: 'existing-credential-id',
      });

      await controller.connect(mockRequest, mockUser, {
        brandId: brandOid,
        credentialId: 'existing-credential-id',
      });

      expect(credentialsResolveBrandAccountMock).toHaveBeenCalledWith({
        brandId: brandOid,
        credentialId: 'existing-credential-id',
        isDisconnectedIncluded: true,
        organizationId: instagramOrganizationId,
        platform: 'instagram',
      });
      expect(credentialsBeginOAuthForBrandMock).toHaveBeenCalledWith(
        mockBrand,
        instagramUserId,
        'instagram',
        expect.objectContaining({ isConnected: false }),
        'existing-credential-id',
      );
    });

    it('rejects a reconnect credentialId from another brand', async () => {
      brandsFindOneMock.mockResolvedValue({
        id: brandOid,
        organizationId: instagramOrganizationId,
        userId: instagramUserId,
      });
      credentialsResolveBrandAccountMock.mockResolvedValue(null);

      const result = await controller.connect(mockRequest, mockUser, {
        brandId: brandOid,
        credentialId: 'someone-elses-credential-id',
      });

      expect(result).toHaveProperty('errors');
      expect(credentialsBeginOAuthForBrandMock).not.toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    const brandId = instagramBrandId;
    const orgId = instagramOrganizationId;
    const state = 'opaque-oauth-state';
    const mockRequest = {} as unknown as Request;

    function mockSuccessfulTokenExchange(
      scope: string = GRANTED_SCOPE_WITH_PAGES,
    ) {
      httpPostMock.mockReturnValue(
        of({ data: { access_token: 'short-lived-token', scope } }),
      );
      httpGetMock.mockReturnValue(
        of({
          data: { access_token: 'long-lived-token', expires_in: 5184000 },
        }),
      );
    }

    beforeEach(() => {
      credentialsFindPendingOAuthCredentialMock.mockResolvedValue({
        brandId,
        id: 'test-object-id',
        organizationId: orgId,
        userId: instagramUserId,
        warmupSignals: {},
      });
      credentialsPatchMock.mockResolvedValue({
        brandId,
        id: 'test-object-id',
        isConnected: false,
      });
    });

    it('discovers accounts before persisting anything, then saves the token unconnected and resolves the single account', async () => {
      mockSuccessfulTokenExchange();
      instagramServiceMock.listAuthorizedInstagramAccounts.mockResolvedValue([
        igAccount({
          id: 'ig-account-id',
          image: 'https://cdn.example.com/avatar.jpg',
          label: 'Genfeed AI',
          username: 'genfeedai',
        }),
      ]);
      credentialsUpdateExternalProfileMock.mockResolvedValue({
        brandId,
        externalId: 'ig-account-id',
        id: 'test-object-id',
        isConnected: true,
      });

      const result = await controller.verify(mockRequest, {
        code: 'auth-code',
        state,
      });

      expect(
        instagramServiceMock.listAuthorizedInstagramAccounts,
      ).toHaveBeenCalledWith('long-lived-token');
      // Discovery happens before the token is ever persisted.
      const discoveryCallOrder =
        instagramServiceMock.listAuthorizedInstagramAccounts.mock
          .invocationCallOrder[0];
      const persistCallOrder = credentialsPatchMock.mock.invocationCallOrder[0];
      expect(discoveryCallOrder).toBeLessThan(persistCallOrder);

      expect(credentialsPatchMock).toHaveBeenCalledWith(
        'test-object-id',
        expect.objectContaining({
          accessToken: 'long-lived-token',
          isConnected: false,
          isDeleted: false,
          oauthState: null,
        }),
      );
      expect(credentialsUpdateExternalProfileMock).toHaveBeenCalledWith(
        'test-object-id',
        orgId,
        {
          avatarUrl: 'https://cdn.example.com/avatar.jpg',
          handle: 'genfeedai',
          id: 'ig-account-id',
          name: 'Genfeed AI',
        },
      );
      expect(
        instagramAuthorizedSignalsServiceMock.refresh,
      ).toHaveBeenCalledWith({
        accessToken: 'long-lived-token',
        credentialId: 'test-object-id',
        force: true,
        grantedScopes: GRANTED_SCOPE_WITH_PAGES,
        organizationId: orgId,
      });
      expect(result.data).toEqual({
        brandId,
        externalId: 'ig-account-id',
        id: 'test-object-id',
        isConnected: true,
      });
    });

    it('rejects a grant missing pages_show_list with a permission-specific error, writing nothing', async () => {
      mockSuccessfulTokenExchange('instagram_basic,instagram_content_publish');

      const failure = await captureHttpException(
        controller.verify(mockRequest, { code: 'auth-code', state }),
      );

      expect(failure.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(failure.getResponse()).toEqual(
        expect.objectContaining({ title: 'Missing permission' }),
      );
      expect(
        instagramServiceMock.listAuthorizedInstagramAccounts,
      ).not.toHaveBeenCalled();
      expect(credentialsPatchMock).not.toHaveBeenCalled();
    });

    it('fails outright on zero eligible accounts, writing nothing', async () => {
      mockSuccessfulTokenExchange();
      instagramServiceMock.listAuthorizedInstagramAccounts.mockResolvedValue(
        [],
      );

      const failure = await captureHttpException(
        controller.verify(mockRequest, { code: 'auth-code', state }),
      );

      expect(failure.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(failure.getResponse()).toEqual(
        expect.objectContaining({ title: 'Instagram account not eligible' }),
      );
      expect(credentialsPatchMock).not.toHaveBeenCalled();
      expect(credentialsUpdateExternalProfileMock).not.toHaveBeenCalled();
    });

    it('resolves a matching reconnect intent even among several accounts', async () => {
      mockSuccessfulTokenExchange();
      instagramServiceMock.listAuthorizedInstagramAccounts.mockResolvedValue([
        igAccount({ id: 'ig-account-a' }),
        igAccount({ id: 'ig-account-b' }),
      ]);
      credentialsFindPendingOAuthCredentialMock.mockResolvedValue({
        brandId,
        id: 'test-object-id',
        organizationId: orgId,
        userId: instagramUserId,
        warmupSignals: {
          oauthConnectIntent: { reconnectCredentialId: 'reconnect-target-id' },
        },
      });
      credentialsResolveBrandAccountMock.mockResolvedValue({
        externalId: 'ig-account-b',
        id: 'reconnect-target-id',
      });
      credentialsUpdateExternalProfileMock.mockResolvedValue({
        brandId,
        externalId: 'ig-account-b',
        id: 'test-object-id',
        isConnected: true,
      });

      await controller.verify(mockRequest, { code: 'auth-code', state });

      expect(credentialsResolveBrandAccountMock).toHaveBeenCalledWith({
        brandId,
        credentialId: 'reconnect-target-id',
        isDisconnectedIncluded: true,
        organizationId: orgId,
        platform: 'instagram',
      });
      expect(credentialsUpdateExternalProfileMock).toHaveBeenCalledWith(
        'test-object-id',
        orgId,
        expect.objectContaining({ id: 'ig-account-b' }),
      );
    });

    it('never embeds the reconnect credential id in the OAuth state', async () => {
      const mockBrand = {
        id: brandId,
        organizationId: orgId,
        userId: instagramUserId,
      };
      brandsFindOneMock.mockResolvedValue(mockBrand);
      credentialsResolveBrandAccountMock.mockResolvedValue({
        externalId: 'ig-account-id',
        id: 'reconnect-target-id',
      });
      credentialsBeginOAuthForBrandMock.mockResolvedValue({
        credential: { id: 'test-object-id' },
        state: 'opaque-oauth-state',
      });

      const result = await controller.connect(
        {} as unknown as Request,
        { organizationId: orgId, userId: instagramUserId } as unknown as User,
        { brandId, credentialId: 'reconnect-target-id' },
      );

      const url = (result.data as unknown as { url: string }).url;
      expect(url).not.toContain('reconnect-target-id');
    });

    it('leaves an unmatched reconnect intent ambiguous, even with a single remaining account', async () => {
      mockSuccessfulTokenExchange();
      instagramServiceMock.listAuthorizedInstagramAccounts.mockResolvedValue([
        igAccount({ id: 'ig-account-unrelated' }),
      ]);
      credentialsFindPendingOAuthCredentialMock.mockResolvedValue({
        brandId,
        id: 'test-object-id',
        organizationId: orgId,
        userId: instagramUserId,
        warmupSignals: {
          oauthConnectIntent: { reconnectCredentialId: 'reconnect-target-id' },
        },
      });
      credentialsResolveBrandAccountMock.mockResolvedValue({
        externalId: 'ig-account-that-is-gone',
        id: 'reconnect-target-id',
      });

      const result = await controller.verify(mockRequest, {
        code: 'auth-code',
        state,
      });

      // Never silently substitutes ig-account-unrelated for the intended
      // reconnect target, even though it is the only candidate.
      expect(credentialsUpdateExternalProfileMock).not.toHaveBeenCalled();
      expect(result.data).toEqual(
        expect.objectContaining({ id: 'test-object-id', isConnected: false }),
      );
    });

    it('resolves a reconnect intent whose target credential was deleted the same as any other unmatched intent', async () => {
      mockSuccessfulTokenExchange();
      instagramServiceMock.listAuthorizedInstagramAccounts.mockResolvedValue([
        igAccount({ id: 'ig-account-a' }),
      ]);
      credentialsFindPendingOAuthCredentialMock.mockResolvedValue({
        brandId,
        id: 'test-object-id',
        organizationId: orgId,
        userId: instagramUserId,
        warmupSignals: {
          oauthConnectIntent: { reconnectCredentialId: 'deleted-credential' },
        },
      });
      // resolveBrandAccount returns null for a credential that no longer
      // belongs to this brand/platform — including one that was deleted.
      credentialsResolveBrandAccountMock.mockResolvedValue(null);

      const result = await controller.verify(mockRequest, {
        code: 'auth-code',
        state,
      });

      expect(credentialsUpdateExternalProfileMock).not.toHaveBeenCalled();
      expect(result.data).toEqual(
        expect.objectContaining({ isConnected: false }),
      );
    });

    it('excludes accounts already held by another live credential of this brand, then resolves the remaining one', async () => {
      mockSuccessfulTokenExchange();
      instagramServiceMock.listAuthorizedInstagramAccounts.mockResolvedValue([
        igAccount({ id: 'ig-account-held' }),
        igAccount({ id: 'ig-account-free' }),
      ]);
      credentialsFindConnectedAccountsMock.mockResolvedValue([
        { externalId: 'ig-account-held', id: 'other-live-credential-id' },
      ]);
      credentialsUpdateExternalProfileMock.mockResolvedValue({
        brandId,
        externalId: 'ig-account-free',
        id: 'test-object-id',
        isConnected: true,
      });

      await controller.verify(mockRequest, {
        code: 'auth-code',
        state,
      });

      expect(credentialsFindConnectedAccountsMock).toHaveBeenCalledWith(
        orgId,
        brandId,
        'instagram',
      );
      expect(credentialsUpdateExternalProfileMock).toHaveBeenCalledWith(
        'test-object-id',
        orgId,
        expect.objectContaining({ id: 'ig-account-free' }),
      );
    });

    it('merges into the incumbent credential when updateExternalProfile reconciles a matching externalId', async () => {
      mockSuccessfulTokenExchange();
      instagramServiceMock.listAuthorizedInstagramAccounts.mockResolvedValue([
        igAccount({ id: 'ig-account-id' }),
      ]);
      // reconcileConnectedAccount inside updateExternalProfile can return a
      // *different* row (the incumbent) than the credential passed in.
      credentialsUpdateExternalProfileMock.mockResolvedValue({
        brandId,
        externalId: 'ig-account-id',
        id: 'incumbent-credential-id',
        isConnected: true,
      });

      const result = await controller.verify(mockRequest, {
        code: 'auth-code',
        state,
      });

      expect(result.data).toEqual(
        expect.objectContaining({ id: 'incumbent-credential-id' }),
      );
      expect(
        instagramAuthorizedSignalsServiceMock.refresh,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ credentialId: 'incumbent-credential-id' }),
      );
    });

    it('leaves the connection unresolved and unconnected when several accounts remain ambiguous', async () => {
      mockSuccessfulTokenExchange();
      instagramServiceMock.listAuthorizedInstagramAccounts.mockResolvedValue([
        igAccount({ id: 'ig-account-a' }),
        igAccount({ id: 'ig-account-b' }),
      ]);

      const result = await controller.verify(mockRequest, {
        code: 'auth-code',
        state,
      });

      expect(credentialsUpdateExternalProfileMock).not.toHaveBeenCalled();
      expect(result.data).toEqual(
        expect.objectContaining({ id: 'test-object-id', isConnected: false }),
      );
      expect(
        instagramAuthorizedSignalsServiceMock.refresh,
      ).not.toHaveBeenCalled();
      expect(
        historyImportServiceMock.scheduleForCredential,
      ).not.toHaveBeenCalled();
    });

    it('should return bad request when code or state is missing', async () => {
      const result = await controller.verify(mockRequest, {});

      expect(result).toHaveProperty('errors');
    });

    it('returns an explicit server error when app credentials are missing', async () => {
      const emptyConfigMock = {
        get: vi.fn(() => undefined),
      } as unknown as ConfigService;
      const emptyCredentialsMock = {
        findPendingOAuthCredential: vi.fn().mockResolvedValue({
          brandId,
          id: 'credential-id',
          organizationId: orgId,
          userId: 'user-id',
        }),
        findOne: vi.fn(),
        patch: vi.fn(),
      } as unknown as CredentialsService;
      const emptyConnectionResolver = new InstagramConnectionResolverService(
        emptyConfigMock,
        emptyCredentialsMock,
        { get: vi.fn(), post: vi.fn() } as unknown as HttpService,
        instagramServiceMock as unknown as InstagramService,
        instagramAuthorizedSignalsServiceMock as unknown as InstagramAuthorizedSignalsService,
        historyImportServiceMock as unknown as SocialSourceHistoryImportService,
        loggerMock,
      );
      const ctrl = new InstagramController(
        emptyConfigMock,
        { findOne: vi.fn() } as unknown as BrandsService,
        emptyCredentialsMock,
        instagramServiceMock as unknown as InstagramService,
        instagramAuthorizedSignalsServiceMock as unknown as InstagramAuthorizedSignalsService,
        emptyConnectionResolver,
        loggerMock,
      );

      const failure = await captureHttpException(
        ctrl.verify(mockRequest, {
          code: 'code',
          state,
        }),
      );

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect(failure.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it.each([190, 102])(
      'returns an actionable client response for Facebook authorization code %s',
      async (providerCode) => {
        const callbackCode = 'sensitive-callback-code';
        const providerMessage = 'sensitive-provider-message';
        httpPostMock.mockReturnValue(
          throwError(() => ({
            response: {
              data: {
                error: { code: providerCode, message: providerMessage },
              },
              status: 400,
            },
          })),
        );

        const failure = await captureHttpException(
          controller.verify(mockRequest, {
            code: callbackCode,
            state,
          }),
        );

        expect(failure.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(failure.getResponse()).toEqual({
          detail:
            'Instagram rejected the authorization code. It may have expired, already been used, or be invalid. Please reconnect your Instagram account.',
          title: 'Authentication failed',
        });
        expect(loggerErrorMock).toHaveBeenCalledWith(
          expect.stringContaining('failed'),
          expect.objectContaining({
            category: 'authorization',
            httpStatus: 400,
            providerCode,
            stage: 'short_lived_token',
          }),
        );
        const logs = JSON.stringify([
          ...loggerLogMock.mock.calls,
          ...loggerErrorMock.mock.calls,
        ]);
        expect(logs).not.toContain(callbackCode);
        expect(logs).not.toContain(state);
        expect(logs).not.toContain(providerMessage);
      },
    );

    it('returns a safe client response for a nested redirect mismatch', async () => {
      const providerMessage =
        'redirect_uri mismatch at https://private.example/callback';
      httpPostMock.mockReturnValue(
        throwError(() => ({
          response: {
            data: {
              error: {
                error: { code: 100, message: providerMessage },
              },
            },
            status: 400,
          },
        })),
      );

      const failure = await captureHttpException(
        controller.verify(mockRequest, {
          code: 'redirect-mismatch-code',
          state,
        }),
      );

      expect(failure.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(failure.getResponse()).toEqual({
        detail:
          'Instagram rejected the authorization because the redirect URI did not match. Please reconnect your Instagram account. If the problem continues, contact support.',
        title: 'Configuration error',
      });
      expect(JSON.stringify(failure.getResponse())).not.toContain(
        providerMessage,
      );
      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.objectContaining({
          category: 'redirect_mismatch',
          providerCode: 100,
          stage: 'short_lived_token',
        }),
      );
      expect(JSON.stringify(loggerErrorMock.mock.calls)).not.toContain(
        providerMessage,
      );
    });

    it('returns a safe provider error for a malformed Facebook response', async () => {
      const rawPayloadMarker = 'raw-provider-payload';
      httpPostMock.mockReturnValue(
        throwError(() => ({
          response: {
            data: { error: { error: null }, raw: rawPayloadMarker },
            status: 400,
          },
        })),
      );

      const failure = await captureHttpException(
        controller.verify(mockRequest, {
          code: 'malformed-response-code',
          state,
        }),
      );

      expect(failure.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      expect(failure.getResponse()).toEqual({
        detail:
          'Instagram could not complete the token exchange. Please try again later.',
        title: 'Instagram provider error',
      });
      expect(JSON.stringify(loggerErrorMock.mock.calls)).not.toContain(
        rawPayloadMarker,
      );
      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.objectContaining({
          category: 'provider_failure',
          httpStatus: 400,
          stage: 'short_lived_token',
        }),
      );
    });

    it('classifies an unrecognized Facebook failure without exposing it', async () => {
      const providerMessage = 'unclassified private provider detail';
      httpPostMock.mockReturnValue(
        throwError(() => ({
          response: {
            data: {
              error: { code: 999, message: providerMessage },
            },
            status: 400,
          },
        })),
      );

      const failure = await captureHttpException(
        controller.verify(mockRequest, {
          code: 'unclassified-code',
          state,
        }),
      );

      expect(failure.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.objectContaining({
          category: 'provider_failure',
          providerCode: 999,
          stage: 'short_lived_token',
        }),
      );
      expect(JSON.stringify(failure.getResponse())).not.toContain(
        providerMessage,
      );
      expect(JSON.stringify(loggerErrorMock.mock.calls)).not.toContain(
        providerMessage,
      );
    });

    it('returns a service error for invalid Facebook app configuration', async () => {
      httpPostMock.mockReturnValue(
        throwError(() => ({
          response: {
            data: {
              error: { code: 101, message: 'Invalid application secret' },
            },
            status: 401,
          },
        })),
      );

      const failure = await captureHttpException(
        controller.verify(mockRequest, {
          code: 'config-error-code',
          state,
        }),
      );

      expect(failure.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(failure.getResponse()).toEqual({
        detail: 'Instagram OAuth is not configured correctly on this server.',
        title: 'Integration not configured',
      });
    });

    it('classifies long-lived token authorization failures consistently', async () => {
      const shortLivedToken = 'sensitive-short-lived-token';
      httpPostMock.mockReturnValue(
        of({ data: { access_token: shortLivedToken } }),
      );
      httpGetMock.mockReturnValue(
        throwError(() => ({
          response: {
            data: {
              error: { code: 190, message: 'Token already expired' },
            },
            status: 400,
          },
        })),
      );

      const failure = await captureHttpException(
        controller.verify(mockRequest, {
          code: 'long-token-code',
          state,
        }),
      );

      expect(failure.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(failure.getResponse()).toEqual(
        expect.objectContaining({ title: 'Authentication failed' }),
      );
      expect(loggerErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.objectContaining({
          category: 'authorization',
          stage: 'long_lived_token',
        }),
      );
      expect(JSON.stringify(loggerErrorMock.mock.calls)).not.toContain(
        shortLivedToken,
      );
    });

    it('should return not found when credential does not exist', async () => {
      credentialsFindPendingOAuthCredentialMock.mockResolvedValue(null);

      const result = await controller.verify(mockRequest, {
        code: 'code',
        state,
      });

      expect(result).toHaveProperty('errors');
      expect(JSON.stringify(result)).not.toContain(state);
    });

    it('should return bad request when short-lived token is missing', async () => {
      httpPostMock.mockReturnValue(of({ data: { access_token: null } }));

      const result = await controller.verify(mockRequest, {
        code: 'code',
        state,
      });

      expect(result).toHaveProperty('errors');
    });
  });

  describe('selectAccount', () => {
    const orgId = instagramOrganizationId;
    const credentialId = 'test-object-id';
    const mockUser = {
      organizationId: orgId,
      userId: instagramUserId,
    } as unknown as User;
    const mockRequest = {} as unknown as Request;

    it("validates the chosen externalId against the credential's own token, then finalizes", async () => {
      credentialsFindOneMock.mockResolvedValue({
        accessToken: 'encrypted-token',
        id: credentialId,
        isDeleted: false,
      });
      instagramServiceMock.listAuthorizedInstagramAccounts.mockResolvedValue([
        igAccount({ id: 'ig-account-a' }),
        igAccount({ id: 'ig-account-b' }),
      ]);
      credentialsUpdateExternalProfileMock.mockResolvedValue({
        externalId: 'ig-account-b',
        grantedScopes: ['instagram_basic'],
        id: credentialId,
        isConnected: true,
      });

      const result = await controller.selectAccount(
        mockRequest,
        mockUser,
        credentialId,
        { externalId: 'ig-account-b' },
      );

      expect(
        instagramServiceMock.listAuthorizedInstagramAccounts,
      ).toHaveBeenCalledWith('encrypted-token');
      expect(credentialsUpdateExternalProfileMock).toHaveBeenCalledWith(
        credentialId,
        orgId,
        expect.objectContaining({ id: 'ig-account-b' }),
      );
      expect(
        instagramAuthorizedSignalsServiceMock.refresh,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ credentialId, force: true }),
      );
      expect(result.data).toEqual(
        expect.objectContaining({ id: credentialId }),
      );
    });

    it('rejects an externalId the token does not authorize', async () => {
      credentialsFindOneMock.mockResolvedValue({
        accessToken: 'encrypted-token',
        id: credentialId,
        isDeleted: false,
      });
      instagramServiceMock.listAuthorizedInstagramAccounts.mockResolvedValue([
        igAccount({ id: 'ig-account-a' }),
      ]);

      const result = await controller.selectAccount(
        mockRequest,
        mockUser,
        credentialId,
        { externalId: 'someone-elses-account-id' },
      );

      expect(result).toHaveProperty('errors');
      expect(credentialsUpdateExternalProfileMock).not.toHaveBeenCalled();
    });

    it('returns not found for a cross-org credential id', async () => {
      credentialsFindOneMock.mockResolvedValue(null);

      const result = await controller.selectAccount(
        mockRequest,
        mockUser,
        'someone-elses-credential',
        { externalId: 'ig-account-a' },
      );

      expect(result).toHaveProperty('errors');
      expect(
        instagramServiceMock.listAuthorizedInstagramAccounts,
      ).not.toHaveBeenCalled();
    });

    it('requires an externalId in the request body', async () => {
      const result = await controller.selectAccount(
        mockRequest,
        mockUser,
        credentialId,
        {},
      );

      expect(result).toHaveProperty('errors');
      expect(credentialsFindOneMock).not.toHaveBeenCalled();
    });
  });

  describe('refreshAuthorizedSignals', () => {
    const orgId = instagramOrganizationId;
    const credentialId = 'test-object-id';
    const mockUser = {
      organizationId: orgId,
      userId: instagramUserId,
    } as unknown as User;
    const mockRequest = {} as unknown as Request;

    it('returns not found when the credential is missing or cross-org', async () => {
      instagramAuthorizedSignalsServiceMock.refresh.mockRejectedValueOnce(
        new NotFoundException('Instagram credential'),
      );

      await expect(
        controller.refreshAuthorizedSignals(
          mockRequest,
          mockUser,
          'missing-credential',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(credentialsFindOneMock).not.toHaveBeenCalled();
    });

    it('refreshes and returns only the caller organization credential', async () => {
      credentialsFindOneMock.mockResolvedValueOnce({
        id: credentialId,
        organizationId: orgId,
        platform: 'instagram',
      });

      const result = await controller.refreshAuthorizedSignals(
        mockRequest,
        mockUser,
        credentialId,
      );

      expect(
        instagramAuthorizedSignalsServiceMock.refresh,
      ).toHaveBeenCalledWith({
        credentialId,
        organizationId: orgId,
      });
      expect(credentialsFindOneMock).toHaveBeenCalledWith({
        id: credentialId,
        organizationId: orgId,
        platform: 'instagram',
      });
      expect(result).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ id: credentialId }),
        }),
      );
    });
  });

  describe('getTrends', () => {
    it('should return trends from instagramService', () => {
      const trends = [{ name: '#fashion', volume: 500 }];
      instagramServiceMock.getTrends.mockReturnValue(trends);

      const result = controller.getTrends();

      expect(result).toEqual(trends);
    });

    it('should return error when getTrends throws', () => {
      instagramServiceMock.getTrends.mockImplementation(() => {
        throw new Error('Service unavailable');
      });

      const result = controller.getTrends();

      expect(result).toHaveProperty('errors');
    });
  });
});

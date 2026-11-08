import {
  Credential,
  CredentialInstagram,
} from '@genfeedai/models/auth/credential.model';
import {
  collectionDocument,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { installFakeHttpRoutes } from '@services/__mocks__/http-routes.fake';
import { CredentialsService } from '@services/organization/credentials.service';
import { beforeEach, describe, expect, it } from 'vitest';

const credentialId = 'cred_1';
const health = [{ credentialId, status: 'healthy' }];
const readiness = [{ credentialId, isReady: true }];
const context = { credentialId, isReady: true };

describe('CredentialsService HTTP methods', () => {
  let service: CredentialsService;
  let server: ReturnType<typeof installFakeHttpRoutes>;

  beforeEach(() => {
    service = new CredentialsService('credentials-token');
    server = installFakeHttpRoutes(service, {
      'GET /brand/brand_1/account-health': health,
      'GET /brand/brand_1/publishing-readiness': readiness,
      'GET /cred_1/instagram/pages': collectionDocument([
        { id: 'page_1', name: 'Page' },
      ]),
      'GET /cred_1/publishing-context?surface=post': context,
      'GET /cred_1/publishing-context?surface=thread': {
        ...context,
        isReady: false,
      },
      'GET /cred_1/quota': resourceDocument(
        { remaining: 10, used: 2 },
        { id: 'quota_1' },
      ),
      'PATCH /cred_1/account-health/override': (body: unknown) => ({
        credentialId,
        override: body,
        status: 'healthy',
      }),
      'POST /cred_1/account-health/assess': (body: unknown) => ({
        credentialId,
        request: body,
        status: 'warning',
      }),
      'POST /cred_1/refresh': resourceDocument(
        { platform: 'instagram' },
        { id: credentialId },
      ),
    });
  });

  it('findCredentialInstagramPages maps Instagram pages', async () => {
    const result = await service.findCredentialInstagramPages(credentialId);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(CredentialInstagram);
    expect(result[0]).toMatchObject({ id: 'page_1', name: 'Page' });
  });

  it('refreshCredential POSTs the refresh action', async () => {
    const result = await service.refreshCredential(credentialId);

    expect(result).toBeInstanceOf(Credential);
    expect(result).toMatchObject({ id: credentialId, platform: 'instagram' });
  });

  it('listBrandAccountHealth GETs the brand health list', async () => {
    await expect(service.listBrandAccountHealth('brand_1')).resolves.toEqual(
      health,
    );
  });

  it('listBrandPublishingReadiness GETs readiness and honours cancellation', async () => {
    await expect(
      service.listBrandPublishingReadiness('brand_1'),
    ).resolves.toEqual(readiness);

    const controller = new AbortController();
    controller.abort();
    await expect(
      service.listBrandPublishingReadiness('brand_1', controller.signal),
    ).rejects.toThrow('canceled');
  });

  it('getPublishingContext defaults to the post surface', async () => {
    await expect(service.getPublishingContext(credentialId)).resolves.toEqual(
      context,
    );
    await expect(
      service.getPublishingContext(credentialId, 'thread'),
    ).resolves.toMatchObject({ isReady: false });
  });

  it('assessAccountHealth POSTs an empty assessment request by default', async () => {
    await expect(service.assessAccountHealth(credentialId)).resolves.toEqual({
      credentialId,
      request: {},
      status: 'warning',
    });
  });

  it('overrideAccountHealth PATCHes the manual override and never POSTs it', async () => {
    const override = {
      confirm: true,
      reason: 'Verified the account manually',
    } as const;

    const result = await service.overrideAccountHealth(credentialId, override);

    expect(result).toEqual({ credentialId, override, status: 'healthy' });
    expect(Object.keys(server.bodies)).toEqual([
      'PATCH /cred_1/account-health/override',
    ]);
  });

  it('getQuotaStatus extracts the quota resource', async () => {
    await expect(service.getQuotaStatus(credentialId)).resolves.toMatchObject({
      remaining: 10,
      used: 2,
    });
  });
});

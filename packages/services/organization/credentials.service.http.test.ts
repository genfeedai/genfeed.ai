import {
  Credential,
  CredentialInstagram,
} from '@genfeedai/models/auth/credential.model';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { CredentialsService } from '@services/organization/credentials.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CredentialsService HTTP methods', () => {
  const credentialId = 'cred_1';
  let service: CredentialsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CredentialsService('credentials-token');
    http = installMockHttp(service);
  });

  it('findCredentialInstagramPages maps Instagram pages', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'page_1', name: 'Page' }])),
    );

    const result = await service.findCredentialInstagramPages(credentialId);

    expect(http.get).toHaveBeenCalledWith(`/${credentialId}/instagram/pages`);
    expect(result[0]).toBeInstanceOf(CredentialInstagram);
  });

  it('refreshCredential POSTs the refresh action', async () => {
    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument({ platform: 'instagram' }, { id: credentialId }),
      ),
    );

    const result = await service.refreshCredential(credentialId);

    expect(http.post).toHaveBeenCalledWith(`/${credentialId}/refresh`);
    expect(result).toBeInstanceOf(Credential);
  });

  it('listBrandAccountHealth GETs the brand health list', async () => {
    const health = [{ credentialId, status: 'healthy' }];
    http.get.mockResolvedValue(axiosResponse(health));

    const result = await service.listBrandAccountHealth('brand_1');

    expect(http.get).toHaveBeenCalledWith('/brand/brand_1/account-health');
    expect(result).toEqual(health);
  });

  it('listBrandPublishingReadiness GETs readiness with a signal', async () => {
    const controller = new AbortController();
    const readiness = [{ credentialId, isReady: true }];
    http.get.mockResolvedValue(axiosResponse(readiness));

    const result = await service.listBrandPublishingReadiness(
      'brand_1',
      controller.signal,
    );

    expect(http.get).toHaveBeenCalledWith(
      '/brand/brand_1/publishing-readiness',
      { signal: controller.signal },
    );
    expect(result).toEqual(readiness);
  });

  it('getPublishingContext GETs with the default surface', async () => {
    const context = { credentialId, isReady: true };
    http.get.mockResolvedValue(axiosResponse(context));

    const result = await service.getPublishingContext(credentialId);

    expect(http.get).toHaveBeenCalledWith(
      `/${credentialId}/publishing-context`,
      { params: { surface: 'post' }, signal: undefined },
    );
    expect(result).toEqual(context);
  });

  it('assessAccountHealth POSTs the assessment request', async () => {
    const summary = { credentialId, status: 'warning' };
    http.post.mockResolvedValue(axiosResponse(summary));

    const result = await service.assessAccountHealth(credentialId);

    expect(http.post).toHaveBeenCalledWith(
      `/${credentialId}/account-health/assess`,
      {},
    );
    expect(result).toEqual(summary);
  });

  it('overrideAccountHealth PATCHes the manual override and never POSTs it', async () => {
    const summary = { credentialId, status: 'healthy' };
    http.patch.mockResolvedValue(axiosResponse(summary));

    const result = await service.overrideAccountHealth(credentialId, {
      status: 'healthy',
    });

    expect(http.patch).toHaveBeenCalledWith(
      `/${credentialId}/account-health/override`,
      { status: 'healthy' },
    );
    expect(http.post).not.toHaveBeenCalled();
    expect(result).toEqual(summary);
  });

  it('getQuotaStatus extracts the quota resource', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        resourceDocument({ remaining: 10, used: 2 }, { id: 'quota_1' }),
      ),
    );

    const result = await service.getQuotaStatus(credentialId);

    expect(http.get).toHaveBeenCalledWith(`/${credentialId}/quota`);
    expect(result).toMatchObject({ remaining: 10, used: 2 });
  });
});

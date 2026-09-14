import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants';
import {
  clearRequestOrganizationId,
  setRequestOrganizationId,
} from '@services/core/interceptor.service';
import { ApiKeysService } from '@services/management/api-keys.service';
import axios, { type AxiosAdapter } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/helpers/ui/modal/modal.helper');

const adapter = vi.fn<AxiosAdapter>(async (config) => ({
  config,
  data: { data: [] },
  headers: {},
  status: 200,
  statusText: 'OK',
}));

afterEach(() => {
  clearRequestOrganizationId();
  vi.restoreAllMocks();
  adapter.mockClear();
});

function installAdapter() {
  const create = axios.create.bind(axios);
  vi.spyOn(axios, 'create').mockImplementation((config) =>
    create({ ...config, adapter }),
  );
}

describe('organization-bound API key dispatch', () => {
  it('uses fresh instances with a matching immutable header', async () => {
    installAdapter();
    setRequestOrganizationId('org-a');
    const service = ApiKeysService.forOrganization('token', 'org-a');
    expect(ApiKeysService.forOrganization('token', 'org-a')).not.toBe(service);
    await service.findAll();
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(
      adapter.mock.calls[0]?.[0].headers[ORGANIZATION_CONTEXT_HEADER],
    ).toBe('org-a');
  });

  it.each(['mismatch', 'absent', 'empty', 'round-trip'])(
    'rejects %s scope before the Axios adapter',
    async (scenario) => {
      installAdapter();
      setRequestOrganizationId('org-a');
      const service = ApiKeysService.forOrganization(
        'token',
        scenario === 'empty' ? '' : 'org-a',
      );
      if (scenario === 'mismatch') setRequestOrganizationId('org-b');
      if (scenario === 'absent') clearRequestOrganizationId();
      if (scenario === 'round-trip') {
        setRequestOrganizationId('org-b');
        setRequestOrganizationId('org-a');
      }
      await expect(service.findAll()).rejects.toMatchObject({
        isCancelled: true,
        silent: true,
      });
      expect(adapter).not.toHaveBeenCalled();
    },
  );

  it.each(['findAll', 'create', 'rotate', 'revoke'] as const)(
    'rejects %s when scope changes between invocation and Axios dispatch',
    async (operation) => {
      installAdapter();
      setRequestOrganizationId('org-a');
      const service = ApiKeysService.forOrganization('token', 'org-a');
      const request =
        operation === 'findAll'
          ? service.findAll()
          : operation === 'create'
            ? service.createApiKey({ label: 'Key', scopes: ['videos:read'] })
            : operation === 'rotate'
              ? service.rotateApiKey('key-a')
              : service.revokeApiKey('key-a');
      setRequestOrganizationId('org-b');
      setRequestOrganizationId('org-a');
      await expect(request).rejects.toMatchObject({
        isCancelled: true,
        silent: true,
      });
      expect(adapter).not.toHaveBeenCalled();
    },
  );

  it('retains a binding when the same confirmed ID is set again', async () => {
    installAdapter();
    setRequestOrganizationId('org-a');
    const service = ApiKeysService.forOrganization('token', 'org-a');
    setRequestOrganizationId('org-a');
    await service.findAll();
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});

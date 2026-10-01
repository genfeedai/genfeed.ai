import { WorkflowMediaCredentialRouteService } from '@api/collections/workflows/services/workflow-media-credential-route.service';
import type { ByokService } from '@api/services/byok/byok.service';
import { ByokProvider } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('workflow pinned provider credential route', () => {
  const byok = { lookupApiKeyWithIdentity: vi.fn() };
  const service = new WorkflowMediaCredentialRouteService(
    byok as unknown as ByokService,
  );
  const credential = {
    credentialId: 'frozen-version',
    apiKey: 'ephemeral-provider-key',
  };
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('pins an eligible BYOK identity without storing its key in the route', async () => {
    byok.lookupApiKeyWithIdentity.mockResolvedValue(credential);
    expect(await service.prepareRoute('org', ByokProvider.REPLICATE)).toEqual({
      kind: 'byok',
      credentialId: credential.credentialId,
    });
    expect(byok.lookupApiKeyWithIdentity).toHaveBeenCalledExactlyOnceWith(
      'org',
      ByokProvider.REPLICATE,
    );
  });
  it('selects platform only after a strict lookup confirms absence', async () => {
    byok.lookupApiKeyWithIdentity.mockResolvedValue(undefined);
    expect(await service.prepareRoute('org', ByokProvider.REPLICATE)).toEqual({
      kind: 'platform',
    });
  });
  it('propagates preparation read failures', async () => {
    byok.lookupApiKeyWithIdentity.mockRejectedValue(
      new Error('settings unavailable'),
    );
    await expect(
      service.prepareRoute('org', ByokProvider.REPLICATE),
    ).rejects.toThrow('settings unavailable');
  });
  it('keeps an admitted platform route even if a BYOK key was added later', async () => {
    byok.lookupApiKeyWithIdentity.mockResolvedValue(credential);
    expect(
      await service.resolvePinnedCredential('org', ByokProvider.REPLICATE, {
        kind: 'platform',
      }),
    ).toBeUndefined();
    expect(byok.lookupApiKeyWithIdentity).not.toHaveBeenCalled();
  });
  it('returns the exact validated credential with only one tenant/provider lookup', async () => {
    byok.lookupApiKeyWithIdentity.mockResolvedValue(credential);
    expect(
      await service.resolvePinnedCredential('org', ByokProvider.REPLICATE, {
        kind: 'byok',
        credentialId: credential.credentialId,
      }),
    ).toBe(credential);
    expect(byok.lookupApiKeyWithIdentity).toHaveBeenCalledExactlyOnceWith(
      'org',
      ByokProvider.REPLICATE,
    );
  });
  it.each([undefined, { ...credential, credentialId: 'new-version' }])(
    'denies a missing or replaced pinned key (%j)',
    async (resolved) => {
      byok.lookupApiKeyWithIdentity.mockResolvedValue(resolved);
      await expect(
        service.resolvePinnedCredential('org', ByokProvider.REPLICATE, {
          kind: 'byok',
          credentialId: credential.credentialId,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          detail: 'Workflow BYOK credential changed after funding preparation',
        }),
      });
      expect(byok.lookupApiKeyWithIdentity).toHaveBeenCalledTimes(1);
    },
  );
  it('propagates pinned dispatch lookup failure without platform fallback', async () => {
    byok.lookupApiKeyWithIdentity.mockRejectedValue(
      new Error('decryption unavailable'),
    );
    await expect(
      service.resolvePinnedCredential('org', ByokProvider.REPLICATE, {
        kind: 'byok',
        credentialId: credential.credentialId,
      }),
    ).rejects.toThrow('decryption unavailable');
  });
});

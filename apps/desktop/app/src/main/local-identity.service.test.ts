import { describe, expect, it } from 'bun:test';
import type { DesktopKvService } from './kv.service';
import { LocalIdentityService } from './local-identity.service';

const createKvMock = (initialValues: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initialValues));

  return {
    getValue: async (key: string) => values.get(key) ?? null,
    setValue: async (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  } as unknown as DesktopKvService & { values: Map<string, string> };
};

describe('LocalIdentityService', () => {
  it('creates stable local user and device ids on first boot', async () => {
    const kv = createKvMock();
    const service = new LocalIdentityService(kv);

    await service.initialize();

    expect(service.getLocalUserId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(service.getLocalDeviceId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(kv.values.get('local.user.id')).toBe(service.getLocalUserId());
    expect(kv.values.get('local.device.id')).toBe(service.getLocalDeviceId());
  });

  it('loads existing identity and persists Better Auth user id separately', async () => {
    const kv = createKvMock({
      'local.device.id': 'device-1',
      'local.user.id': 'user-1',
    });
    const service = new LocalIdentityService(kv);

    await service.initialize();
    await service.setBetterAuthId('cloud-user-1');

    expect(service.getLocalUserId()).toBe('user-1');
    expect(service.getLocalDeviceId()).toBe('device-1');
    expect(service.getBetterAuthId()).toBe('cloud-user-1');
    expect(kv.values.get('local.user.betterAuthId')).toBe('cloud-user-1');
  });

  it('keeps local attribution stable when a different cloud account connects', async () => {
    const kv = createKvMock({
      'local.device.id': 'device-1',
      'local.user.betterAuthId': 'cloud-user-1',
      'local.user.id': 'local-user-1',
    });
    const service = new LocalIdentityService(kv);

    await service.initialize();
    await service.setBetterAuthId('cloud-user-2');

    expect(service.getLocalUserId()).toBe('local-user-1');
    expect(service.getLocalDeviceId()).toBe('device-1');
    expect(service.getBetterAuthId()).toBe('cloud-user-2');
  });
});

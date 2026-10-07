import type { IncomingMessage } from 'node:http';
import type { CloudTenantObserver } from '@api/helpers/cloud-tenant-diagnostics/cloud-tenant-diagnostics';
import {
  CLOUD_TENANT_OBSERVER,
  getCloudTenantObserver,
  observeCloudTenant,
} from '@api/helpers/cloud-tenant-diagnostics/cloud-tenant-diagnostics';

describe('CI-only tenant observation seam', () => {
  const observer: CloudTenantObserver = {
    protocol: 1,
    ingress: vi.fn(),
    bindRequest: vi.fn((_request: IncomingMessage, next: () => void) => next),
    tenantFailure: vi.fn(),
    pipelineEnter: vi.fn(),
    pipelineNext: vi.fn(),
    pipelineError: vi.fn(),
    pipelineFinalize: vi.fn(),
    unavailable: vi.fn(),
  };
  beforeEach(() => {
    vi.stubEnv('CLOUD_SWEEP_DIAGNOSTICS', '1');
    vi.stubEnv('CI', 'true');
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    vi.stubEnv('GENFEED_CLOUD', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('CLOUD_SWEEP_LOCAL', undefined);
    Reflect.set(globalThis, CLOUD_TENANT_OBSERVER, observer);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(globalThis, CLOUD_TENANT_OBSERVER);
    vi.clearAllMocks();
  });
  it('requires every exact activation marker and callable protocol method', () => {
    expect(getCloudTenantObserver()).toBe(observer);
    for (const key of [
      'CLOUD_SWEEP_DIAGNOSTICS',
      'CI',
      'GITHUB_ACTIONS',
      'GENFEED_CLOUD',
      'NODE_ENV',
    ]) {
      const old = Reflect.get(process.env, key);
      vi.stubEnv(key, 'production');
      expect(getCloudTenantObserver()).toBeUndefined();
      vi.stubEnv(key, old);
    }
    vi.stubEnv('CLOUD_SWEEP_LOCAL', '1');
    expect(getCloudTenantObserver()).toBeUndefined();
    vi.stubEnv('CLOUD_SWEEP_LOCAL', undefined);
    for (const value of [
      undefined,
      { ...observer, protocol: 2 },
      { ...observer, ingress: undefined },
      { ...observer, bindRequest: undefined },
      { ...observer, tenantFailure: undefined },
      { ...observer, private: 'token' },
    ]) {
      Reflect.set(globalThis, CLOUD_TENANT_OBSERVER, value);
      expect(getCloudTenantObserver()).toBeUndefined();
    }
  });
  it('disabled calls never invoke observer and thrown callbacks cannot escape', () => {
    expect(
      observeCloudTenant(undefined, () => {
        throw new Error('must not run');
      }),
    ).toBeUndefined();
    expect(observeCloudTenant(observer, () => 7)).toBe(7);
    expect(() =>
      observeCloudTenant(observer, () => {
        throw new Error('private observer failure');
      }),
    ).not.toThrow();
    expect(observer.unavailable).toHaveBeenCalledTimes(1);
    const broken = {
      ...observer,
      unavailable() {
        throw new Error('private');
      },
    };
    expect(() =>
      observeCloudTenant(broken, () => {
        throw new Error('private');
      }),
    ).not.toThrow();
  });
  it('binding failure falls back once while application throws escape unchanged', () => {
    const request = { headers: {} } as IncomingMessage;
    const applicationError = new Error('application');
    const run = (value: CloudTenantObserver, next: () => void) => {
      const bound = observeCloudTenant(value, (active) =>
        active.bindRequest(request, next),
      );
      if (typeof bound !== 'function')
        observeCloudTenant(value, (active) => active.unavailable());
      (typeof bound === 'function' ? bound : next)();
    };
    const next = vi.fn(() => {
      throw applicationError;
    });
    expect(() => run(observer, next)).toThrow(applicationError);
    expect(next).toHaveBeenCalledTimes(1);
    expect(observer.unavailable).not.toHaveBeenCalled();
    const broken = {
      ...observer,
      bindRequest: () => {
        throw new Error('binding');
      },
    };
    expect(() => run(broken, next)).toThrow(applicationError);
    expect(next).toHaveBeenCalledTimes(2);
    expect(observer.unavailable).toHaveBeenCalled();
    const invalid = { ...observer, bindRequest: vi.fn(() => undefined) };
    // Runtime protocol validation must not retry application execution.
    Reflect.set(globalThis, CLOUD_TENANT_OBSERVER, invalid);
    const bound = observeCloudTenant(getCloudTenantObserver(), (active) =>
      active.bindRequest(request, next),
    );
    if (typeof bound !== 'function')
      observeCloudTenant(observer, (active) => active.unavailable());
    expect(() => (typeof bound === 'function' ? bound : next)()).toThrow(
      applicationError,
    );
    expect(next).toHaveBeenCalledTimes(3);
  });
});

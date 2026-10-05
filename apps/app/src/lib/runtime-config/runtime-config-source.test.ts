import { describe, expect, it } from 'vitest';
import { createRuntimeAuthConfigSource } from './runtime-config-source';

describe('createRuntimeAuthConfigSource', () => {
  it.each([true, false])('serializes the auth flag %s', (isEnabled) => {
    expect(createRuntimeAuthConfigSource(isEnabled)).toBe(
      `globalThis.__GENFEED_RUNTIME_CONFIG__={...globalThis.__GENFEED_RUNTIME_CONFIG__,...{"betterAuthEnabled":${isEnabled}}};`,
    );
  });

  it('preserves bootstrap fields while overriding the auth flag', () => {
    const runtimeGlobal = {
      __GENFEED_RUNTIME_CONFIG__: {
        apiEndpoint: '/v1',
        betterAuthEnabled: false,
        clientSurface: 'desktop',
      },
    };

    new Function('globalThis', createRuntimeAuthConfigSource(true))(
      runtimeGlobal,
    );

    expect(runtimeGlobal.__GENFEED_RUNTIME_CONFIG__).toEqual({
      apiEndpoint: '/v1',
      betterAuthEnabled: true,
      clientSurface: 'desktop',
    });
  });
});

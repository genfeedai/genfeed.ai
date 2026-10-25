import { describe, expect, it } from 'vitest';
import { createRuntimeAuthConfigSource } from './runtime-config-source';

describe('createRuntimeAuthConfigSource', () => {
  it.each([true, false])('serializes the auth flag %s', (isEnabled) => {
    expect(createRuntimeAuthConfigSource(isEnabled)).toBe(
      `globalThis.__GENFEED_RUNTIME_CONFIG__={...globalThis.__GENFEED_RUNTIME_CONFIG__,...{"betterAuthEnabled":${isEnabled},"isGoogleSignInAvailable":false,"isMagicLinkAvailable":true}};`,
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
      isGoogleSignInAvailable: false,
      isMagicLinkAvailable: true,
    });
  });

  it.each([true, false])(
    'serializes Google capability %s independently of other auth flags',
    (available) => {
      const runtimeGlobal = { __GENFEED_RUNTIME_CONFIG__: {} };
      new Function(
        'globalThis',
        createRuntimeAuthConfigSource(false, false, available),
      )(runtimeGlobal);
      expect(runtimeGlobal.__GENFEED_RUNTIME_CONFIG__).toEqual({
        betterAuthEnabled: false,
        isGoogleSignInAvailable: available,
        isMagicLinkAvailable: false,
      });
    },
  );

  it('serializes that magic links cannot be delivered', () => {
    const runtimeGlobal = { __GENFEED_RUNTIME_CONFIG__: {} };

    new Function('globalThis', createRuntimeAuthConfigSource(true, false))(
      runtimeGlobal,
    );

    expect(runtimeGlobal.__GENFEED_RUNTIME_CONFIG__).toEqual({
      betterAuthEnabled: true,
      isGoogleSignInAvailable: false,
      isMagicLinkAvailable: false,
    });
  });

  it('serializes that Google sign-in is not configured', () => {
    const runtimeGlobal = { __GENFEED_RUNTIME_CONFIG__: {} };

    new Function(
      'globalThis',
      createRuntimeAuthConfigSource(true, true, false),
    )(runtimeGlobal);

    expect(runtimeGlobal.__GENFEED_RUNTIME_CONFIG__).toEqual({
      betterAuthEnabled: true,
      isGoogleSignInAvailable: false,
      isMagicLinkAvailable: true,
    });
  });
});

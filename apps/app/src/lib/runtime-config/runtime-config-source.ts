export function createRuntimeAuthConfigSource(
  isEnabled: boolean,
  isMagicLinkAvailable = true,
  isGoogleSignInAvailable = true,
): string {
  const config = {
    betterAuthEnabled: isEnabled,
    isGoogleSignInAvailable,
    isMagicLinkAvailable,
  };
  return `globalThis.__GENFEED_RUNTIME_CONFIG__={...globalThis.__GENFEED_RUNTIME_CONFIG__,...${JSON.stringify(config).replaceAll('<', '\\u003c')}};`;
}

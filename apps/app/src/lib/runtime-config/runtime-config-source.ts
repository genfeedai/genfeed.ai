export function createRuntimeAuthConfigSource(isEnabled: boolean): string {
  const config = { betterAuthEnabled: isEnabled };
  return `globalThis.__GENFEED_RUNTIME_CONFIG__={...globalThis.__GENFEED_RUNTIME_CONFIG__,...${JSON.stringify(config).replaceAll('<', '\\u003c')}};`;
}

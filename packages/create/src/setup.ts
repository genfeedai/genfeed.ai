import { pathToFileURL } from 'node:url';

type SetupInput = Record<string, string | undefined>;

function origin(value: string, variable: string, allowPath = false): string {
  try {
    const parsed = new URL(value);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      /['"`$\\\r\n]/.test(value) ||
      (parsed.pathname !== '/' && !allowPath) ||
      parsed.search ||
      parsed.hash
    )
      throw new Error();
    return allowPath ? parsed.href : parsed.origin;
  } catch {
    throw new Error(
      `${variable} must be an HTTP(S) origin without credentials, path, query or fragment.`,
    );
  }
}

function isLocal(value: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname);
}

export function resolveSetupEnvironment(
  input: SetupInput,
): Record<string, string> {
  const key = input.OPENROUTER_API_KEY ?? '';
  if (
    !/^sk-or-[A-Za-z0-9_-]{8,}$/.test(key) ||
    /placeholder|your[_-]|change[_-]?me|example|dummy/i.test(key)
  ) {
    throw new Error(
      'OPENROUTER_API_KEY is required and must contain a non-placeholder OpenRouter key. Set it before starting.',
    );
  }
  const domain = input.SELFHOSTED_DOMAIN?.trim() ?? '';
  for (const name of [
    'SELFHOSTED_APP_PORT',
    'SELFHOSTED_API_PORT',
    'SELFHOSTED_MCP_PORT',
  ]) {
    const value = input[name];
    if (
      value &&
      (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)
    )
      throw new Error(`${name} must be a port from 1 to 65535.`);
  }
  const publicOrigin = domain
    ? origin(
        domain.includes('://') ? domain : `https://${domain}`,
        'SELFHOSTED_DOMAIN',
      )
    : '';
  const app = origin(
    input.GENFEEDAI_PUBLIC_URL ||
      publicOrigin ||
      `http://localhost:${input.SELFHOSTED_APP_PORT || '3000'}`,
    'GENFEEDAI_PUBLIC_URL',
  );
  const api = origin(
    input.GENFEEDAI_API_PUBLIC_URL ||
      publicOrigin ||
      (isLocal(app)
        ? `http://localhost:${input.SELFHOSTED_API_PORT || '3010'}`
        : app),
    'GENFEEDAI_API_PUBLIC_URL',
  );
  const auth = origin(input.BETTER_AUTH_URL || api, 'BETTER_AUTH_URL');
  const trusted = (input.BETTER_AUTH_TRUSTED_ORIGINS || app)
    .split(',')
    .map((value) => origin(value.trim(), 'BETTER_AUTH_TRUSTED_ORIGINS'));
  if (!isLocal(app) || !isLocal(api)) {
    const publicVariable = !isLocal(app)
      ? 'GENFEEDAI_PUBLIC_URL'
      : 'GENFEEDAI_API_PUBLIC_URL';
    const publicValue = !isLocal(app) ? app : api;
    if (isLocal(auth))
      throw new Error(
        `${publicVariable}=${publicValue} conflicts with BETTER_AUTH_URL=${auth}. Use the public auth origin.`,
      );
    if (auth !== api)
      throw new Error('BETTER_AUTH_URL must match GENFEEDAI_API_PUBLIC_URL.');
    if (trusted.some(isLocal) || !trusted.includes(app))
      throw new Error(
        `${publicVariable}=${publicValue} conflicts with BETTER_AUTH_TRUSTED_ORIGINS=${trusted.join(',')}. Include the public app origin and remove localhost.`,
      );
    if (isLocal(app) || isLocal(api))
      throw new Error(
        'GENFEEDAI_PUBLIC_URL and GENFEEDAI_API_PUBLIC_URL must both use public origins for a domain install.',
      );
  }
  return {
    SELFHOSTED_DOMAIN: publicOrigin,
    GENFEEDAI_PUBLIC_URL: app,
    GENFEEDAI_API_PUBLIC_URL: api,
    GENFEEDAI_MCP_PUBLIC_URL: origin(
      input.GENFEEDAI_MCP_PUBLIC_URL ||
        (!isLocal(app)
          ? `${app}/mcp`
          : `http://localhost:${input.SELFHOSTED_MCP_PORT || '3014'}/mcp`),
      'GENFEEDAI_MCP_PUBLIC_URL',
      true,
    ),
    BETTER_AUTH_URL: auth,
    BETTER_AUTH_TRUSTED_ORIGINS: trusted.join(','),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const environment = resolveSetupEnvironment(process.env);
    for (const [name, value] of Object.entries(environment)) {
      process.stdout.write(
        `export ${name}='${value.replaceAll("'", "'\\''")}'\n`,
      );
    }
  } catch (error) {
    process.stderr.write(
      `[entrypoint] FATAL: ${error instanceof Error ? error.message : 'Invalid self-hosted configuration'}\n`,
    );
    process.exitCode = 1;
  }
}

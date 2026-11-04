import type { ConfigurationIssue } from '@libs/health/health-contributor.interface';

/**
 * The configuration a self-hosted install needs for sign-in and generation to
 * work. The container entrypoint (`packages/create/src/setup.ts`) refuses to
 * boot on the same mistakes; this re-checks them from inside the running API so
 * `/v1/health/ready` cannot report ready on a deployment that only appears to
 * work (#7886). Keep the OpenRouter key rule and the BETTER_AUTH_SECRET
 * placeholder in step with `setup.ts` and `.env.example`.
 */
export interface SelfHostedConfigInput {
  isAuthEnabled: boolean;
  openRouterApiKey?: string;
  authSecret?: string;
  authUrl?: string;
  authTrustedOrigins?: string;
  appPublicUrl?: string;
  apiPublicUrl?: string;
}

const OPENROUTER_KEY_SHAPE = /^sk-or-[A-Za-z0-9_-]{8,}$/;
const PLACEHOLDER_PATTERN = /placeholder|your[_-]|change[_-]?me|example|dummy/i;
const AUTH_SECRET_PLACEHOLDER = 'replace_with_a_long_random_secret';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function parseOrigin(value: string | undefined): URL | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return new URL(trimmed);
  } catch {
    return undefined;
  }
}

function isLocalOrigin(url: URL): boolean {
  return LOCAL_HOSTNAMES.has(url.hostname);
}

function hasUsableOpenRouterKey(value: string | undefined): boolean {
  const key = value?.trim() ?? '';
  return OPENROUTER_KEY_SHAPE.test(key) && !PLACEHOLDER_PATTERN.test(key);
}

function findAuthIssues(input: SelfHostedConfigInput): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];
  const secret = input.authSecret?.trim() ?? '';

  if (!secret || secret === AUTH_SECRET_PLACEHOLDER) {
    issues.push({
      message:
        'Sessions are signed with a missing or placeholder secret; set your own (openssl rand -base64 48).',
      variable: 'BETTER_AUTH_SECRET',
    });
  }

  const app = parseOrigin(input.appPublicUrl);
  const api = parseOrigin(input.apiPublicUrl);
  const publicOrigin = [app, api].find((url) => url && !isLocalOrigin(url));
  if (!publicOrigin) {
    return issues;
  }

  const publicVariable =
    publicOrigin === app ? 'GENFEEDAI_PUBLIC_URL' : 'GENFEEDAI_API_PUBLIC_URL';
  const auth = parseOrigin(input.authUrl);
  if (!auth || isLocalOrigin(auth)) {
    issues.push({
      message: `${publicVariable} is a public address but BETTER_AUTH_URL is ${auth ? 'a local address' : 'unset'}; sign-in from the public address will fail.`,
      variable: 'BETTER_AUTH_URL',
    });
  }

  const trusted = (input.authTrustedOrigins ?? '')
    .split(',')
    .map((value) => parseOrigin(value)?.origin)
    .filter((origin): origin is string => Boolean(origin));
  if (app && !isLocalOrigin(app) && !trusted.includes(app.origin)) {
    issues.push({
      message:
        "GENFEEDAI_PUBLIC_URL is not among BETTER_AUTH_TRUSTED_ORIGINS; the browser's sign-in request will be rejected.",
      variable: 'BETTER_AUTH_TRUSTED_ORIGINS',
    });
  }

  return issues;
}

export function findSelfHostedConfigIssues(
  input: SelfHostedConfigInput,
): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];

  if (!hasUsableOpenRouterKey(input.openRouterApiKey)) {
    issues.push({
      message:
        'Missing or placeholder OpenRouter key; text generation and the agent will fail. Create one at https://openrouter.ai/keys.',
      variable: 'OPENROUTER_API_KEY',
    });
  }

  if (input.isAuthEnabled) {
    issues.push(...findAuthIssues(input));
  }

  return issues;
}

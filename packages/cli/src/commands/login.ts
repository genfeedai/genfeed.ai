import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import process from 'node:process';
import { password, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { validateApiKey } from '@/api/auth';
import { listBrands } from '@/api/brands';
import { type LoginEndpoints, normalizeBaseUrl } from '@/config/endpoints';
import {
  getLoginEndpoints,
  setActiveBrand,
  setApiKey,
  setOrganizationId,
  setProfileField,
  setRole,
} from '@/config/store';
import { formatHeader, formatLabel, formatSuccess, formatWarning, print } from '@/ui/theme';
import { openExternalUrl } from '@/utils/browser';
import { GenfeedError, handleError } from '@/utils/errors';

const CALLBACK_TIMEOUT = 120_000; // 2 minutes

interface PkceParams {
  challenge: string;
  verifier: string;
}

interface ExchangeResponse {
  issuedAt: string;
  token: string;
  userEmail?: string;
  userId: string;
  userName?: string;
}

export interface LoginOptions {
  apiUrl?: string;
  appUrl?: string;
  intent?: 'login' | 'signup';
  key?: string;
  interactive?: boolean;
}

interface AuthorizeUrlParams {
  challenge: string;
  intent?: 'login' | 'signup';
  port: number;
  state: string;
}

interface ExchangeAuthCodeParams {
  code: string;
  codeVerifier: string;
  state: string;
}

/**
 * Build the authorization page URL the browser is sent to. The web app reads
 * `port` to know which localhost listener to redirect the one-time code back to.
 */
export function buildAuthorizeUrl(authUrl: string, params: AuthorizeUrlParams): string {
  const query = new URLSearchParams({
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
    port: String(params.port),
    state: params.state,
  });

  if (params.intent === 'signup') {
    query.set('intent', 'signup');
  }

  return `${authUrl}?${query.toString()}`;
}

/**
 * Exchange the one-time authorization code for a long-lived API key against the
 * deployment's own API (`POST /auth/desktop/exchange`).
 */
export async function exchangeAuthCode(
  apiBaseUrl: string,
  params: ExchangeAuthCodeParams
): Promise<ExchangeResponse> {
  const response = await fetch(`${apiBaseUrl}/auth/desktop/exchange`, {
    body: JSON.stringify({
      code: params.code,
      codeVerifier: params.codeVerifier,
      state: params.state,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => 'Unknown error');
    throw new GenfeedError(`Token exchange failed: ${body}`);
  }

  const data = (await response.json()) as ExchangeResponse;

  if (!data.token) {
    throw new GenfeedError('No token returned by server');
  }

  return data;
}

function generatePkce(): PkceParams {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { challenge, verifier };
}

function generateState(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * Start a temporary localhost HTTP server to receive the PKCE OAuth callback.
 * Validates state, exchanges the code for a token, and returns the token.
 */
function waitForOAuthCallback(
  endpoints: LoginEndpoints,
  intent: 'login' | 'signup' = 'login'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const pkce = generatePkce();
    const expectedState = generateState();

    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://localhost`);

      if (url.pathname === '/callback') {
        const error = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(callbackPage('Authentication failed', error, false));
          cleanup();
          reject(new GenfeedError(error));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(callbackPage('Error', 'No authorization code received.', false));
          return;
        }

        if (returnedState !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(callbackPage('Error', 'State mismatch. Possible CSRF.', false));
          cleanup();
          reject(new GenfeedError('State mismatch during OAuth callback'));
          return;
        }

        try {
          const data = await exchangeAuthCode(endpoints.apiBaseUrl, {
            code,
            codeVerifier: pkce.verifier,
            state: expectedState,
          });

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            callbackPage(
              'Authenticated',
              'You can close this tab and return to the terminal.',
              true
            )
          );
          cleanup();
          resolve(data.token);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Token exchange failed';
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(callbackPage('Authentication failed', message, false));
          cleanup();
          reject(new GenfeedError(message));
        }

        return;
      }

      res.writeHead(404);
      res.end();
    });

    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new GenfeedError(
          'Authentication timed out',
          'Try again with `gf login` or use `gf login -k <key>` for manual auth'
        )
      );
    }, CALLBACK_TIMEOUT);

    function cleanup() {
      clearTimeout(timeout);
      process.removeListener('SIGINT', onSigint);
      server.close();
    }

    function onSigint() {
      cleanup();
      reject(new GenfeedError('Authentication cancelled'));
      process.exit(130);
    }

    process.on('SIGINT', onSigint);

    // Listen on random available port
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const authUrl = buildAuthorizeUrl(endpoints.authUrl, {
          challenge: pkce.challenge,
          intent,
          port: addr.port,
          state: expectedState,
        });

        print();
        print(formatHeader('Opening browser to authenticate...'));
        print(chalk.dim(authUrl));
        print();

        void openExternalUrl(authUrl);
      }
    });

    server.on('error', (err) => {
      cleanup();
      reject(new GenfeedError(`Failed to start auth server: ${err.message}`));
    });
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function callbackPage(title: string, message: string, success: boolean): string {
  const color = success ? '#7C3AED' : '#ef4444';
  const icon = success ? '&#10003;' : '&#10007;';
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return `<!DOCTYPE html>
<html><head><title>gf - ${safeTitle}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa; }
  .card { text-align: center; padding: 3rem; border-radius: 1rem; border: 1px solid #333; max-width: 400px; }
  .icon { font-size: 3rem; color: ${color}; margin-bottom: 1rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
  p { color: #888; margin: 0; }
</style></head>
<body><div class="card">
  <div class="icon">${icon}</div>
  <h1>${safeTitle}</h1>
  <p>${safeMessage}</p>
</div></body></html>`;
}

async function completeLogin(apiKey: string, endpoints: LoginEndpoints): Promise<void> {
  await setApiKey(apiKey);

  const spinner = ora('Validating...').start();

  try {
    const whoamiData = await validateApiKey();
    spinner.succeed();

    await setOrganizationId(whoamiData.organization.id);

    print();
    print(formatSuccess(`Logged in as ${chalk.bold(whoamiData.organization.name)}`));
    print(formatLabel('Email', whoamiData.user.email));
    print(formatLabel('Scopes', whoamiData.scopes.join(', ')));

    if (whoamiData.scopes.includes('admin') || whoamiData.scopes.includes('superadmin')) {
      await setRole('admin');
      print(formatLabel('Role', chalk.green('admin')));
    }

    print();

    try {
      const brands = await listBrands(whoamiData.organization.id);

      if (brands.length === 0) {
        print(formatWarning(`No brands found. Create one at ${endpoints.appUrl}`));
      } else if (brands.length === 1) {
        await setActiveBrand(brands[0].id);
        print(formatSuccess(`Active brand: ${chalk.bold(brands[0].label)}`));
      } else {
        const selected = await select({
          choices: brands.map((brand) => ({
            description: brand.description,
            name: brand.label,
            value: brand.id,
          })),
          message: 'Select a brand:',
        });

        await setActiveBrand(selected);
        const selectedBrand = brands.find((b) => b.id === selected);
        print();
        print(formatSuccess(`Active brand: ${chalk.bold(selectedBrand?.label)}`));
      }
    } catch {
      print(formatWarning('Could not fetch brands. Set one later with `gf brand use`'));
    }
  } catch (error) {
    spinner.fail('Invalid API key');
    await setApiKey('');
    throw error;
  }
}

export async function runLogin(options: LoginOptions): Promise<void> {
  try {
    // Persist endpoint overrides first so every subsequent command — and the
    // browser flow below — targets the same deployment.
    if (options.apiUrl) {
      await setProfileField('apiUrl', normalizeBaseUrl(options.apiUrl));
    }
    if (options.appUrl) {
      await setProfileField('appUrl', normalizeBaseUrl(options.appUrl));
    }

    const endpoints = await getLoginEndpoints();

    // Direct key — skip everything
    if (options.key) {
      if (!options.key.startsWith('gf_live_') && !options.key.startsWith('gf_test_')) {
        throw new GenfeedError(
          'Invalid API key format',
          'API keys should start with gf_live_ or gf_test_'
        );
      }
      await completeLogin(options.key, endpoints);
      return;
    }

    // Manual paste mode
    if (options.interactive) {
      print(chalk.dim('Create an API key in your Genfeed settings, then paste it here.\n'));

      const apiKey = await password({
        mask: '*',
        message: 'Enter your Genfeed API key:',
        validate: (value) => {
          if (!value) return 'API key is required';
          if (!value.startsWith('gf_')) return 'Invalid key format (should start with gf_)';
          return true;
        },
      });

      if (!apiKey.startsWith('gf_live_') && !apiKey.startsWith('gf_test_')) {
        throw new GenfeedError(
          'Invalid API key format',
          'API keys should start with gf_live_ or gf_test_'
        );
      }

      await completeLogin(apiKey, endpoints);
      return;
    }

    // Default: OAuth browser flow
    const spinner = ora('Waiting for authentication...').start();

    try {
      const apiKey = await waitForOAuthCallback(endpoints, options.intent);
      spinner.succeed('Authenticated');
      await completeLogin(apiKey, endpoints);
    } catch (error) {
      spinner.fail('Authentication failed');
      throw error;
    }
  } catch (error) {
    handleError(error);
  }
}

export function createLoginCommand(name = 'login', intent: 'login' | 'signup' = 'login'): Command {
  return new Command(name)
    .description(
      intent === 'signup'
        ? 'Create a Genfeed account and authenticate (opens browser)'
        : 'Authenticate with Genfeed (opens browser)'
    )
    .option('-k, --key <key>', 'API key (skip browser, non-interactive)')
    .option('-i, --interactive', 'Paste API key manually instead of browser')
    .option(
      '--api-url <url>',
      'API base URL for a self-hosted deployment (saved to the active profile)'
    )
    .option(
      '--app-url <url>',
      'Web app URL serving /oauth/cli (saved to the active profile; derived from --api-url when omitted)'
    )
    .action(async (options: LoginOptions) => await runLogin({ ...options, intent }));
}

export const loginCommand = createLoginCommand();

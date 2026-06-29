import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { password, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { validateApiKey } from '@/api/auth';
import { listBrands } from '@/api/brands';
import { setActiveBrand, setApiKey, setOrganizationId, setRole } from '@/config/store';
import { formatHeader, formatLabel, formatSuccess, formatWarning, print } from '@/ui/theme';
import { GenfeedError, handleError } from '@/utils/errors';

const AUTH_URL = 'https://app.genfeed.ai/oauth/cli';
const API_BASE_URL = 'https://api.genfeed.ai/v1';
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
  key?: string;
  interactive?: boolean;
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
function waitForOAuthCallback(): Promise<string> {
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
          const exchangeRes = await fetch(`${API_BASE_URL}/auth/desktop/exchange`, {
            body: JSON.stringify({
              code,
              codeVerifier: pkce.verifier,
              state: expectedState,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          });

          if (!exchangeRes.ok) {
            const body = await exchangeRes.text().catch(() => 'Unknown error');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(callbackPage('Authentication failed', body, false));
            cleanup();
            reject(new GenfeedError(`Token exchange failed: ${body}`));
            return;
          }

          const data = (await exchangeRes.json()) as ExchangeResponse;

          if (!data.token) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(callbackPage('Authentication failed', 'No token returned by server.', false));
            cleanup();
            reject(new GenfeedError('No token returned by server'));
            return;
          }

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
        const port = addr.port;
        const params = new URLSearchParams({
          code_challenge: pkce.challenge,
          code_challenge_method: 'S256',
          port: String(port),
          state: expectedState,
        });
        const authUrl = `${AUTH_URL}?${params.toString()}`;

        print();
        print(formatHeader('Opening browser to authenticate...'));
        print(chalk.dim(authUrl));
        print();

        openBrowser(authUrl);
      }
    });

    server.on('error', (err) => {
      cleanup();
      reject(new GenfeedError(`Failed to start auth server: ${err.message}`));
    });
  });
}

async function openBrowser(url: string): Promise<void> {
  const { execFile } = await import('node:child_process');
  const platform = process.platform;

  if (platform === 'darwin') {
    execFile('open', [url]);
  } else if (platform === 'linux') {
    execFile('xdg-open', [url]);
  } else if (platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url]);
  }
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

async function completeLogin(apiKey: string): Promise<void> {
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
        print(formatWarning('No brands found. Create one at https://app.genfeed.ai'));
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
      print(formatWarning('Could not fetch brands. Set one later with `gf brands`'));
    }
  } catch (error) {
    spinner.fail('Invalid API key');
    await setApiKey('');
    throw error;
  }
}

export async function runLogin(options: LoginOptions): Promise<void> {
  try {
    // Direct key — skip everything
    if (options.key) {
      if (!options.key.startsWith('gf_live_') && !options.key.startsWith('gf_test_')) {
        throw new GenfeedError(
          'Invalid API key format',
          'API keys should start with gf_live_ or gf_test_'
        );
      }
      await completeLogin(options.key);
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

      await completeLogin(apiKey);
      return;
    }

    // Default: OAuth browser flow
    const spinner = ora('Waiting for authentication...').start();

    try {
      const apiKey = await waitForOAuthCallback();
      spinner.succeed('Authenticated');
      await completeLogin(apiKey);
    } catch (error) {
      spinner.fail('Authentication failed');
      throw error;
    }
  } catch (error) {
    handleError(error);
  }
}

export function createLoginCommand(name = 'login'): Command {
  return new Command(name)
    .description('Authenticate with Genfeed (opens browser)')
    .option('-k, --key <key>', 'API key (skip browser, non-interactive)')
    .option('-i, --interactive', 'Paste API key manually instead of browser')
    .action(runLogin);
}

export const loginCommand = createLoginCommand();

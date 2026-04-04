import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { password, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { validateApiKey } from '@/api/auth.js';
import { listBrands } from '@/api/brands.js';
import { setActiveBrand, setApiKey, setOrganizationId, setRole } from '@/config/store.js';
import { formatHeader, formatLabel, formatSuccess, formatWarning, print } from '@/ui/theme.js';
import { GenfeedError, handleError } from '@/utils/errors.js';

const AUTH_URL = 'https://app.genfeed.ai/oauth/cli';
const CALLBACK_TIMEOUT = 120_000; // 2 minutes

/**
 * Start a temporary localhost HTTP server to receive the OAuth callback.
 * Returns the API key received from the browser redirect.
 */
function waitForOAuthCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://localhost`);

      if (url.pathname === '/callback') {
        const key = url.searchParams.get('key');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(callbackPage('Authentication failed', error, false));
          cleanup();
          reject(new GenfeedError(error));
          return;
        }

        if (key) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            callbackPage(
              'Authenticated',
              'You can close this tab and return to the terminal.',
              true
            )
          );
          cleanup();
          resolve(key);
          return;
        }

        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(callbackPage('Error', 'No API key received.', false));
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
        const authUrl = `${AUTH_URL}?port=${port}`;

        print();
        print(formatHeader('Opening browser to authenticate...'));
        print(chalk.dim(authUrl));
        print();

        // Open browser
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

export const loginCommand = new Command('login')
  .description('Authenticate with Genfeed (opens browser)')
  .option('-k, --key <key>', 'API key (skip browser, non-interactive)')
  .option('-i, --interactive', 'Paste API key manually instead of browser')
  .action(async (options) => {
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
        print(chalk.dim('Get your API key at: https://app.genfeed.ai/settings/api-keys\n'));

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
        spinner.succeed('Received API key from browser');
        await completeLogin(apiKey);
      } catch (error) {
        spinner.fail('Authentication failed');
        throw error;
      }
    } catch (error) {
      handleError(error);
    }
  });

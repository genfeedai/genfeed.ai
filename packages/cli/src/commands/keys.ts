import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { type ApiKey, createApiKey, listApiKeys, revokeApiKey, rotateApiKey } from '@/api/api-keys';
import { requireAuth } from '@/api/client';
import {
  formatHeader,
  formatLabel,
  formatSuccess,
  formatWarning,
  print,
  printJson,
} from '@/ui/theme';
import { GenfeedError, handleError } from '@/utils/errors';

const SCOPE_PRESETS = {
  content: [
    'videos:read',
    'videos:create',
    'images:read',
    'images:create',
    'prompts:read',
    'prompts:create',
    'articles:read',
    'articles:create',
    'posts:create',
  ],
  full: [
    'videos:read',
    'videos:create',
    'videos:update',
    'videos:delete',
    'images:read',
    'images:create',
    'images:update',
    'images:delete',
    'prompts:read',
    'prompts:create',
    'prompts:update',
    'prompts:delete',
    'articles:read',
    'articles:create',
    'brands:read',
    'credits:read',
    'posts:create',
    'analytics:read',
  ],
  mcp: [
    'videos:read',
    'videos:create',
    'videos:update',
    'videos:delete',
    'images:read',
    'images:create',
    'images:update',
    'images:delete',
    'prompts:read',
    'prompts:create',
    'prompts:update',
    'prompts:delete',
    'articles:read',
    'articles:create',
    'brands:read',
    'credits:read',
    'posts:create',
    'analytics:read',
  ],
  read: [
    'videos:read',
    'images:read',
    'prompts:read',
    'articles:read',
    'brands:read',
    'credits:read',
    'analytics:read',
  ],
} as const;

type ScopePreset = keyof typeof SCOPE_PRESETS;

function parseCsv(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

function parseRateLimit(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new GenfeedError('Invalid rate limit', 'Use a positive integer');
  }
  return parsed;
}

function parseExpiry(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new GenfeedError('Invalid expiry date', 'Use an ISO date or date string');
  }

  return date.toISOString();
}

function resolveScopes(preset: ScopePreset, scopes?: string): string[] {
  return parseCsv(scopes) ?? [...SCOPE_PRESETS[preset]];
}

function getPlainKey(apiKey: ApiKey): string | undefined {
  return apiKey.key ?? apiKey.token;
}

function formatLastUsed(apiKey: ApiKey): string {
  return apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleString() : 'Never';
}

function printApiKeyList(keys: ApiKey[]): void {
  if (keys.length === 0) {
    print(formatWarning('No active API keys found'));
    return;
  }

  print(formatHeader('API Keys\n'));
  for (const key of keys) {
    print(`  ${chalk.bold(key.label ?? 'Untitled key')} ${chalk.dim(key.id)}`);
    print(`    ${chalk.dim(`Scopes: ${(key.scopes ?? []).join(', ') || 'none'}`)}`);
    print(`    ${chalk.dim(`Last used: ${formatLastUsed(key)}`)}`);
    if (key.expiresAt) {
      print(`    ${chalk.dim(`Expires: ${new Date(key.expiresAt).toLocaleString()}`)}`);
    }
  }
}

export const keysCommand = new Command('keys').description(
  'Manage Genfeed API keys for headless and MCP access'
);

keysCommand
  .command('list')
  .description('List active API keys')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching API keys...').start();
      const keys = await listApiKeys();
      spinner.stop();

      if (options.json) {
        printJson({ keys });
        return;
      }

      printApiKeyList(keys);
    } catch (error) {
      handleError(error);
    }
  });

keysCommand
  .command('create')
  .description('Create a new API key')
  .requiredOption('-n, --name <name>', 'API key label')
  .option('-d, --description <description>', 'Description')
  .option('-p, --preset <preset>', 'Scope preset: mcp, read, content, full', 'mcp')
  .option('--scopes <scopes>', 'Comma-separated scopes; overrides preset')
  .option('--expires-at <date>', 'Expiration date')
  .option('--rate-limit <requests>', 'Requests per minute', parseRateLimit)
  .option('--allow-ip <ips>', 'Comma-separated allowed IP addresses')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const preset = options.preset as ScopePreset;
      if (!(preset in SCOPE_PRESETS)) {
        throw new GenfeedError(
          `Unknown scope preset: ${options.preset}`,
          `Use one of: ${Object.keys(SCOPE_PRESETS).join(', ')}`
        );
      }

      const spinner = ora('Creating API key...').start();
      const apiKey = await createApiKey({
        allowedIps: parseCsv(options.allowIp),
        description: options.description,
        expiresAt: parseExpiry(options.expiresAt),
        label: options.name,
        rateLimit: options.rateLimit,
        scopes: resolveScopes(preset, options.scopes),
      });
      spinner.stop();

      const plainKey = getPlainKey(apiKey);

      if (options.json) {
        printJson({ apiKey, key: plainKey });
        return;
      }

      print(formatSuccess('API key created'));
      print(formatLabel('ID', apiKey.id));
      print(formatLabel('Name', apiKey.label ?? options.name));
      if (plainKey) {
        print(formatLabel('Key', chalk.bold(plainKey)));
        print(chalk.dim('Store this key now; it will not be shown again.'));
      }
    } catch (error) {
      handleError(error);
    }
  });

keysCommand
  .command('revoke')
  .description('Revoke an API key')
  .argument('<id>', 'API key ID')
  .option('-f, --force', 'Skip confirmation')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      await requireAuth();

      if (!options.force) {
        const confirmed = await confirm({
          default: false,
          message: `Revoke API key ${id}?`,
        });
        if (!confirmed) {
          print(formatWarning('Revoke cancelled'));
          return;
        }
      }

      const spinner = ora('Revoking API key...').start();
      const apiKey = await revokeApiKey(id);
      spinner.stop();

      if (options.json) {
        printJson({ apiKey, revoked: true });
        return;
      }

      print(formatSuccess('API key revoked'));
      print(formatLabel('ID', apiKey.id));
    } catch (error) {
      handleError(error);
    }
  });

keysCommand
  .command('rotate')
  .description('Rotate an API key and print the new key once')
  .argument('<id>', 'API key ID')
  .option('-f, --force', 'Skip confirmation')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      await requireAuth();

      if (!options.force) {
        const confirmed = await confirm({
          default: false,
          message: `Rotate API key ${id}? The old key will stop working.`,
        });
        if (!confirmed) {
          print(formatWarning('Rotate cancelled'));
          return;
        }
      }

      const spinner = ora('Rotating API key...').start();
      const apiKey = await rotateApiKey(id);
      spinner.stop();

      const plainKey = getPlainKey(apiKey);

      if (options.json) {
        printJson({ apiKey, key: plainKey });
        return;
      }

      print(formatSuccess('API key rotated'));
      print(formatLabel('ID', apiKey.id));
      if (plainKey) {
        print(formatLabel('Key', chalk.bold(plainKey)));
        print(chalk.dim('Store this key now; it will not be shown again.'));
      }
    } catch (error) {
      handleError(error);
    }
  });

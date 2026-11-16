import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import {
  createWarmupAccount,
  prepareWarmupAccount,
  type WarmupAccountInput,
  type WarmupContextDecisions,
  type WarmupPrepareInput,
} from '@/operations/admin';
import {
  formatHeader,
  formatLabel,
  formatSuccess,
  formatWarning,
  print,
  printJson,
} from '@/ui/theme';
import { GenfeedError, handleError } from '@/utils/errors';
import { wantsJson } from '@/utils/options';

interface WarmupCreateOptions {
  brand: string;
  email: string;
  firstName?: string;
  guidance?: string;
  lastName?: string;
  organization: string;
  website?: string;
  yes?: boolean;
}

interface WarmupPrepareOptions {
  action: string;
  amount?: number;
  assetCandidateId?: string;
  prompt?: string;
  contextDecisions?: string;
  publicProfileUrl?: string;
  reason?: string;
  sourceUrl?: string;
  yes?: boolean;
}

async function readContextDecisions(path: string): Promise<WarmupContextDecisions> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new GenfeedError(`Could not read context decisions from ${path}`, 'Pass a JSON file.');
  }
  const fields = (parsed as { fields?: unknown } | null)?.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new GenfeedError(
      'Context decisions need a "fields" object',
      'Shape: {"fields":{"description":{"action":"accept","value":"..."}}}'
    );
  }
  for (const [field, decision] of Object.entries(fields)) {
    const action = (decision as { action?: unknown } | null)?.action;
    if (action !== 'accept' && action !== 'reject' && action !== 'preserve') {
      throw new GenfeedError(
        `Context decision for "${field}" needs an action`,
        'Use "accept", "reject" or "preserve".'
      );
    }
  }
  return parsed as WarmupContextDecisions;
}

export function createWarmupCommand(): Command {
  return new Command('warmup')
    .description('Create and prepare concierge accounts (never sends the invitation email)')
    .addCommand(
      new Command('create')
        .description('Create the lead user, organization and first brand (preview unless --yes)')
        .requiredOption('--email <email>', 'Lead email')
        .requiredOption('--organization <name>', 'Organization name')
        .requiredOption('--brand <name>', 'First brand name')
        .option('--first-name <name>', 'Lead first name')
        .option('--last-name <name>', 'Lead last name')
        .option('--website <url>', 'Brand website URL')
        .option('--guidance <text>', 'Notes for the account (max 2000 characters)')
        .option('--yes', 'Create the account')
        .option('--json', 'Output as JSON')
        .action(async (options: WarmupCreateOptions, command: Command) => {
          try {
            const input: WarmupAccountInput = {
              brandName: options.brand,
              guidance: options.guidance,
              leadEmail: options.email,
              leadFirstName: options.firstName,
              leadLastName: options.lastName,
              organizationName: options.organization,
              websiteUrl: options.website,
            };
            if (!options.yes) {
              print(formatHeader('Warm-up account (preview)\n'));
              print(formatLabel('Lead', options.email));
              print(formatLabel('Organization', options.organization));
              print(formatLabel('Brand', options.brand));
              print(formatWarning('Re-run with --yes to create. No email is sent.'));
              return;
            }
            const account = await createWarmupAccount(input);
            if (wantsJson(command)) {
              printJson(account);
              return;
            }
            print(formatSuccess(`Warm-up account ${account.id} ready`));
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('prepare')
        .description('Run a prepare action on a warm-up account (preview unless --yes)')
        .argument('<accountId>', 'Warm-up account id')
        .requiredOption(
          '--action <action>',
          'repair | fund | preview-context | apply-context | starter-content | attach-starters | archive'
        )
        .option('--amount <credits>', 'Credits for the fund action', Number)
        .option('--reason <text>', 'Audit reason')
        .option('--source-url <url>', 'Source URL for context actions')
        .option('--public-profile-url <url>', 'Public profile URL for context actions')
        .option(
          '--context-decisions <file>',
          'JSON file with per-field accept/reject/preserve decisions for apply-context'
        )
        .option(
          '--asset-candidate-id <id>',
          'Reviewed imported asset candidate (for example banner:2) used by starter-content'
        )
        .option('--prompt <text>', 'Optional prompt for starter-content')
        .option('--yes', 'Run the action')
        .option('--json', 'Output as JSON')
        .action(async (accountId: string, options: WarmupPrepareOptions, command: Command) => {
          try {
            const input: WarmupPrepareInput = {
              action: options.action,
              amount: options.amount,
              assetCandidateId: options.assetCandidateId,
              contextDecisions: options.contextDecisions
                ? await readContextDecisions(options.contextDecisions)
                : undefined,
              prompt: options.prompt,
              publicProfileUrl: options.publicProfileUrl,
              reason: options.reason,
              sourceUrl: options.sourceUrl,
            };
            if (!options.yes) {
              print(formatHeader('Warm-up prepare (preview)\n'));
              print(formatLabel('Account', accountId));
              print(formatLabel('Action', options.action));
              print(formatWarning('Re-run with --yes to run the action.'));
              return;
            }
            const account = await prepareWarmupAccount(accountId, input);
            if (wantsJson(command)) {
              printJson(account);
              return;
            }
            print(formatSuccess(`Ran ${options.action} on ${account.id}`));
          } catch (error) {
            handleError(error);
          }
        })
    );
}

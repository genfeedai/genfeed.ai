import { readFile } from 'node:fs/promises';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { clearAdminTokenCache, revokeAdminSession, verifyAdminSession } from '@/api/admin-client';
import { waitForAdminSession } from '@/commands/login';
import { getAdminSession, getApiUrl, getLoginEndpoints, setAdminSession } from '@/config/store';
import {
  approvePricingRates,
  approveSystemBrand,
  filterPricingRows,
  findPendingVersion,
  readPricingReport,
  readSystemBrand,
  updateSystemBrand,
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

async function runAdminLogin(): Promise<void> {
  const endpoints = await getLoginEndpoints();
  const spinner = ora('Waiting for super admin sign-in in your browser...').start();

  try {
    const session = await waitForAdminSession(endpoints);
    await setAdminSession(session);
    clearAdminTokenCache();
    await verifyAdminSession();
    spinner.succeed('Signed in as a super admin');
  } catch (error) {
    await setAdminSession(undefined);
    spinner.fail('Admin sign-in failed');
    throw error;
  }

  const session = await getAdminSession();
  print();
  print(formatLabel('API', endpoints.apiBaseUrl));
  print(formatLabel('Session expires', session?.expiresAt ?? 'unknown'));
  print(chalk.dim('Admin routes also need this machine on ADMIN_ALLOWED_IPS.'));
}

async function runAdminLogout(): Promise<void> {
  const session = await getAdminSession();
  if (!session) {
    print(formatWarning('No admin session stored'));
    return;
  }

  const isRevoked = await revokeAdminSession(
    await getApiUrl(),
    `${session.cookieName}=${session.cookieValue}`
  );
  await setAdminSession(undefined);
  clearAdminTokenCache();

  print(formatSuccess('Admin session removed'));
  if (!isRevoked) {
    print(formatWarning('Could not revoke it on the server; it lapses at its expiry'));
  }
}

async function runAdminStatus(isJson: boolean): Promise<void> {
  const session = await getAdminSession();
  const isExpired = session ? new Date(session.expiresAt).getTime() <= Date.now() : true;
  let isValid = false;
  if (session && !isExpired) {
    try {
      await verifyAdminSession();
      isValid = true;
    } catch {
      isValid = false;
    }
  }

  const status = {
    expiresAt: session?.expiresAt ?? null,
    isSignedIn: Boolean(session) && !isExpired && isValid,
  };
  if (isJson) {
    printJson(status);
    return;
  }

  print(formatHeader('Admin session\n'));
  print(formatLabel('Signed in', status.isSignedIn ? chalk.green('yes') : chalk.red('no')));
  if (session) print(formatLabel('Expires', session.expiresAt));
  if (!status.isSignedIn) print(chalk.dim('\nRun `genfeed admin login`'));
}

async function runPricingReport(
  options: {
    attention?: boolean;
    level?: 'orange' | 'red';
    provider?: string;
  },
  isJson: boolean
): Promise<void> {
  const report = await readPricingReport();
  const rows = filterPricingRows(report, {
    isAttentionOnly: options.attention,
    level: options.level,
    provider: options.provider,
  });

  if (isJson) {
    printJson({ ...report, rows });
    return;
  }

  print(formatHeader(`Model pricing (${rows.length} of ${report.rows.length} models)\n`));
  for (const row of rows) {
    const marker =
      row.attentionLevel === 'red'
        ? chalk.red('red   ')
        : row.attentionLevel === 'orange'
          ? chalk.yellow('orange')
          : chalk.dim('ok    ');
    const approval = row.isRateApprovalAvailable ? chalk.cyan(' approvable') : '';
    print(`${marker} ${row.key} ${chalk.dim(`(${row.provider}, ${row.status})`)}${approval}`);
    for (const attention of row.attention) print(chalk.dim(`         ${attention.reason}`));
    for (const change of row.pendingRateChanges) {
      const from = change.oldPriceUsd === null ? 'new' : `$${change.oldPriceUsd}`;
      const to = change.newPriceUsd === null ? 'removed' : `$${change.newPriceUsd}`;
      print(chalk.dim(`         ${change.variant}: ${from} -> ${to} per ${change.unit}`));
    }
  }
}

async function runPricingApprove(
  modelId: string,
  options: { version?: string; yes?: boolean }
): Promise<void> {
  const report = await readPricingReport();
  const pendingVersion = findPendingVersion(report, modelId);
  if (!pendingVersion) {
    throw new GenfeedError(
      `No approvable pending rates for ${modelId}`,
      'List candidates with `genfeed admin pricing report --attention`'
    );
  }
  if (options.version && options.version !== pendingVersion) {
    throw new GenfeedError(
      `Pending version is ${pendingVersion}, not ${options.version}`,
      'Review the current pending rates, then approve again'
    );
  }

  const row = report.rows.find(
    (candidate) => candidate.id === modelId || candidate.key === modelId
  );
  print(formatHeader(`Pending rates for ${row?.key ?? modelId}\n`));
  for (const change of row?.pendingRateChanges ?? []) {
    const from = change.oldPriceUsd === null ? 'new' : `$${change.oldPriceUsd}`;
    const to = change.newPriceUsd === null ? 'removed' : `$${change.newPriceUsd}`;
    print(`  ${change.variant}: ${from} -> ${to} per ${change.unit}`);
  }

  if (!options.yes) {
    print(chalk.dim('\nDry run. Re-run with --yes to approve these rates.'));
    return;
  }

  const target = row?.id ?? modelId;
  await approvePricingRates(target, pendingVersion);
  print(formatSuccess(`Approved pending rates for ${row?.key ?? modelId}`));
}

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  } catch {
    throw new GenfeedError(`Could not read JSON from ${filePath}`);
  }
}

function wrap(action: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await action();
    } catch (error) {
      handleError(error);
    }
  };
}

function createPricingCommand(): Command {
  return new Command('pricing')
    .description('Review and approve provider price changes')
    .addCommand(
      new Command('report')
        .description('Show model pricing and what needs review')
        .option('--attention', 'Only models that need an operator')
        .option('--level <level>', 'Only red or orange models')
        .option('--provider <provider>', 'Only one provider')
        .option('--json', 'Output as JSON')
        .action(async (options, command: Command) => {
          try {
            await runPricingReport(options, wantsJson(command));
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('approve')
        .description('Approve a model’s pending provider rates (dry run unless --yes)')
        .argument('<model>', 'Model id or key')
        .option('--version <version>', 'Fail unless the pending version matches')
        .option('--yes', 'Approve instead of previewing')
        .action(async (modelId: string, options) => {
          try {
            await runPricingApprove(modelId, options);
          } catch (error) {
            handleError(error);
          }
        })
    );
}

function createBrandCommand(): Command {
  return new Command('brand')
    .description('Review the Genfeed system brand kit')
    .addCommand(
      new Command('show')
        .description('Show the system brand revision (created on first use)')
        .option('--json', 'Output as JSON')
        .action(async (_options, command: Command) => {
          try {
            const revision = await readSystemBrand();
            if (wantsJson(command)) {
              printJson(revision);
              return;
            }
            print(formatHeader('System brand\n'));
            print(formatLabel('Revision', revision.id));
            print(formatLabel('Updated', revision.updatedAt));
            if (revision.status) print(formatLabel('Status', revision.status));
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('update')
        .description('Replace the draft content from a JSON file')
        .argument('<revision>', 'Revision id')
        .requiredOption('--file <path>', 'JSON file with the draft content')
        .requiredOption('--updated-at <iso>', 'updatedAt of the revision you edited')
        .action(async (revisionId: string, options: { file: string; updatedAt: string }) => {
          try {
            const content = await readJsonFile(options.file);
            const revision = await updateSystemBrand(revisionId, content, options.updatedAt);
            print(formatSuccess(`Draft saved (updated ${revision.updatedAt})`));
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('approve')
        .description('Approve the reviewed draft')
        .argument('<revision>', 'Revision id')
        .requiredOption('--updated-at <iso>', 'updatedAt of the draft you reviewed')
        .action(async (revisionId: string, options: { updatedAt: string }) => {
          try {
            await approveSystemBrand(revisionId, options.updatedAt);
            print(formatSuccess('System brand approved'));
          } catch (error) {
            handleError(error);
          }
        })
    );
}

export const adminCommand = new Command('admin')
  .description('Super admin one-offs over the API: pricing and the system brand')
  .addCommand(
    new Command('login')
      .description('Sign in as a super admin in your browser (no API key is created)')
      .action(wrap(runAdminLogin))
  )
  .addCommand(
    new Command('logout')
      .description('Revoke and remove the stored admin session')
      .action(wrap(runAdminLogout))
  )
  .addCommand(
    new Command('status')
      .description('Show whether an admin session is stored and valid')
      .option('--json', 'Output as JSON')
      .action(async (_options, command: Command) => {
        try {
          await runAdminStatus(wantsJson(command));
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(createPricingCommand())
  .addCommand(createBrandCommand());

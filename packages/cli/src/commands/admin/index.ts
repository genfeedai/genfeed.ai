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
  type PriceSyncProvider,
  readOrganizationAppsReport,
  readPricingReport,
  readSystemBrand,
  seedArticles,
  seedTemplates,
  seedWorkflows,
  syncProviderPrices,
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

const PRICE_SYNC_PROVIDERS: readonly PriceSyncProvider[] = ['all', 'fal', 'replicate'];

async function runPricingSync(options: { provider?: string }): Promise<void> {
  const provider = options.provider ?? 'all';
  if (!PRICE_SYNC_PROVIDERS.includes(provider as PriceSyncProvider)) {
    throw new GenfeedError(
      `Unknown provider ${provider}`,
      `Use one of: ${PRICE_SYNC_PROVIDERS.join(', ')}`
    );
  }

  const queued = await syncProviderPrices(provider as PriceSyncProvider);
  for (const job of queued)
    print(formatSuccess(`Queued ${job.provider} price import (${job.jobId})`));
  print(chalk.dim('\nThe import lands pending rates. In a few minutes, review them with:'));
  print(chalk.dim('  genfeed admin pricing report --attention'));
}

async function runSeedArticles(options: {
  brandId?: string;
  brandSlug?: string;
  organization?: string;
  organizationLabel?: string;
  ownerEmail?: string;
  yes?: boolean;
}): Promise<void> {
  const isDryRun = !options.yes;
  const summary = await seedArticles({
    brandId: options.brandId,
    brandSlug: options.brandSlug,
    dryRun: isDryRun,
    organizationId: options.organization,
    organizationLabel: options.organizationLabel,
    ownerEmail: options.ownerEmail,
  });

  print(formatHeader(`Articles seed${summary.dryRun ? ' (dry run)' : ''}\n`));
  print(formatLabel('Organization', summary.organizationId));
  print(formatLabel('Brand', summary.brandId));
  print(formatLabel(summary.dryRun ? 'Would create' : 'Created', String(summary.created)));
  print(formatLabel(summary.dryRun ? 'Would refresh' : 'Refreshed', String(summary.refreshed)));
  if (summary.dryRun) print(chalk.dim('\nRe-run with --yes to apply.'));
}

async function runSeedTemplates(options: { yes?: boolean }): Promise<void> {
  const summary = await seedTemplates({ dryRun: !options.yes });

  print(formatHeader(`Templates seed${summary.dryRun ? ' (dry run)' : ''}\n`));
  print(formatLabel(summary.dryRun ? 'Would create' : 'Created', String(summary.written)));
  for (const key of summary.keys) print(chalk.dim(`  ${key}`));
  print(formatLabel('Unchanged', String(summary.unchanged)));
  if (summary.dryRun) print(chalk.dim('\nRe-run with --yes to apply.'));
}

async function runSeedWorkflows(options: {
  allBrands?: boolean;
  brandId?: string;
  organization?: string;
  yes?: boolean;
}): Promise<void> {
  const summary = await seedWorkflows({
    allBrands: options.allBrands,
    brandId: options.brandId,
    dryRun: !options.yes,
    organizationId: options.organization,
  });

  print(formatHeader(`Workflows seed${summary.dryRun ? ' (dry run)' : ''}\n`));
  print(formatLabel(summary.dryRun ? 'Would update' : 'Updated', String(summary.updated)));
  print(formatLabel('Unchanged', String(summary.unchanged)));
  print(formatLabel('Skipped', String(summary.skipped)));
  if (summary.dryRun) print(chalk.dim('\nRe-run with --yes to apply.'));
}

async function runOrganizationApps(isJson: boolean): Promise<void> {
  const report = await readOrganizationAppsReport();
  if (isJson) {
    printJson(report);
    return;
  }

  const releasedFlags = Object.entries(report.releaseFlags)
    .filter(([, isReleased]) => isReleased)
    .map(([flag]) => flag);
  print(formatHeader(`${report.organizations.length} organizations\n`));
  print(
    `${formatLabel(
      'Released for everyone',
      releasedFlags.length > 0 ? releasedFlags.join(', ') : chalk.dim('none')
    )}\n`
  );

  for (const organization of report.organizations) {
    const visibleApps = Object.entries(organization.apps)
      .filter(([, app]) => app.isVisible)
      .map(([appId]) => appId);
    const tier = organization.subscriptionTier ?? 'no tier';
    const preview = organization.isReleasePreviewEnabled ? ' (release preview)' : '';
    print(
      `${chalk.bold(organization.label)} ${chalk.dim(`${organization.slug} · ${tier}${preview}`)}`
    );
    print(`  ${visibleApps.length > 0 ? visibleApps.join(', ') : chalk.dim('no apps')}`);
  }
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
      new Command('sync')
        .description('Queue the provider price import now (fal, replicate, or all)')
        .option('--provider <provider>', 'fal, replicate or all (default all)')
        .action(async (options: { provider?: string }) => {
          try {
            await runPricingSync(options);
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

function createSeedCommand(): Command {
  return new Command('seed')
    .description('Run idempotent data seeds without a deploy (dry run unless --yes)')
    .addCommand(
      new Command('articles')
        .description('Publish the launch and help articles')
        .option('--owner-email <email>', 'Email of the user who owns the publishing org')
        .option('--organization <id>', 'Organization id (instead of --owner-email)')
        .option('--organization-label <label>', 'Organization label')
        .option('--brand-id <id>', 'Review brand id')
        .option('--brand-slug <slug>', 'Review brand slug (instead of --brand-id)')
        .option('--yes', 'Apply instead of previewing')
        .action(async (options) => {
          try {
            await runSeedArticles(options);
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('templates')
        .description('Create the missing platform (system) templates')
        .option('--yes', 'Apply instead of previewing')
        .action(async (options) => {
          try {
            await runSeedTemplates(options);
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('workflows')
        .description('Ensure the default recurring workflows per brand')
        .option('--brand-id <id>', 'Only this brand')
        .option('--organization <id>', 'Only this organization')
        .option('--all-brands', 'Every brand (required for a live run without a filter)')
        .option('--yes', 'Apply instead of previewing')
        .action(async (options) => {
          try {
            await runSeedWorkflows(options);
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
  .description(
    'Super admin one-offs over the API: organization apps, pricing, seeds and the system brand'
  )
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
  .addCommand(
    new Command('org-apps')
      .description('List the apps each organization sees, with release flags')
      .option('--json', 'Output as JSON')
      .action(async (_options, command: Command) => {
        try {
          await runOrganizationApps(wantsJson(command));
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(createPricingCommand())
  .addCommand(createSeedCommand())
  .addCommand(createBrandCommand());

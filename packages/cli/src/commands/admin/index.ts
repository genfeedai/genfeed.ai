import { readFile } from 'node:fs/promises';
import type {
  IOnboardingFunnelBucket,
  OnboardingFunnelStep,
} from '@genfeedai/contracts/interfaces';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { clearAdminTokenCache, revokeAdminSession, verifyAdminSession } from '@/api/admin-client';
import { waitForAdminSession } from '@/commands/login';
import { getAdminSession, getApiUrl, getLoginEndpoints, setAdminSession } from '@/config/store';
import {
  approvePricingRates,
  approveSystemBrand,
  createOrganizationBrand,
  createWarmupAccount,
  filterPricingRows,
  findMissingExternalPacks,
  findPendingVersion,
  findPricingFixTargets,
  fixModelPricing,
  grantOrganizationCredits,
  type OrganizationBrandInput,
  type PriceSyncProvider,
  prepareWarmupAccount,
  readHarnessActivation,
  readOnboardingFunnel,
  readOrganizationAppsReport,
  readOrganizationsReport,
  readPricingReport,
  readSystemBrand,
  readTrainingsReport,
  scanOrganizationBrand,
  seedArticles,
  seedTemplates,
  seedWorkflows,
  syncProviderPrices,
  updateSystemBrand,
  type WarmupAccountInput,
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

interface OrganizationBrandCreateOptions {
  backgroundColor?: string;
  description?: string;
  fontFamily?: string;
  label: string;
  org: string;
  primaryColor?: string;
  secondaryColor?: string;
  yes?: boolean;
}

interface OrganizationBrandScanOptions {
  brand: string;
  org: string;
  url: string;
  yes?: boolean;
}

interface CreditsGrantOptions {
  amount: number;
  expiresInDays?: number;
  idempotencyKey?: string;
  reason: string;
  yes?: boolean;
}

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
  publicProfileUrl?: string;
  reason?: string;
  sourceUrl?: string;
  yes?: boolean;
}

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

async function runPricingFix(models: string[], options: { yes?: boolean }): Promise<void> {
  const report = await readPricingReport();
  const targets = findPricingFixTargets(report, models);
  if (targets.length === 0) {
    print(formatSuccess('No models need pricing fixes'));
    return;
  }

  print(formatHeader(`Fix pricing for ${targets.length} models\n`));
  for (const row of targets) {
    const action = row.isRateApprovalAvailable
      ? chalk.cyan('approve pending rates')
      : chalk.dim('re-apply the rate sheet or queue the provider import');
    print(`${row.key} ${chalk.dim(`(${row.provider})`)} ${action}`);
    for (const attention of row.attention) print(chalk.dim(`         ${attention.reason}`));
  }

  if (!options.yes) {
    print(
      chalk.dim(
        '\nDry run. Approving pending rates changes what customers are charged. Re-run with --yes to fix.'
      )
    );
    return;
  }

  const result = await fixModelPricing(targets.map((row) => row.id));
  for (const [label, entries] of [
    ['Re-applied the rate sheet', result.repaired],
    ['Approved pending rates', result.approved],
    ['Queued the provider import', result.syncQueued],
    ['Changed while fixing, run again', result.changed],
  ] as const)
    for (const entry of entries) print(formatSuccess(`${label}: ${entry.key}`));
  for (const entry of result.unresolved)
    print(formatWarning(`Needs a manual rate: ${entry.key} (${entry.reason})`));
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

async function runTrainings(options: { isJson: boolean; limit: number }): Promise<void> {
  const report = await readTrainingsReport();
  if (options.isJson) {
    printJson(report);
    return;
  }

  print(formatHeader(`${report.total} trainings\n`));
  for (const [status, count] of Object.entries(report.byStatus)) {
    print(formatLabel(status, String(count)));
  }
  print('');
  for (const training of report.trainings.slice(0, options.limit)) {
    print(
      `${chalk.bold(training.label)} ${chalk.dim(`${training.status ?? 'no status'} · ${training.model ?? 'no model'}`)}`
    );
    print(
      `  ${training.id} · org ${training.organizationId ?? '-'} · ${training.totalSources ?? 0} sources · ${
        training.totalGeneratedImages ?? 0
      } images · created ${training.createdAt?.slice(0, 10) ?? '-'}`
    );
  }
}

async function runOrganizationsList(options: {
  includeDeleted?: boolean;
  isJson: boolean;
}): Promise<void> {
  const report = await readOrganizationsReport(options.includeDeleted === true);
  if (options.isJson) {
    printJson(report);
    return;
  }

  print(formatHeader(`${report.organizations.length} organizations\n`));
  for (const organization of report.organizations) {
    const deleted = organization.isDeleted ? chalk.red(' (deleted)') : '';
    const tier = organization.subscriptionTier ?? 'no tier';
    print(
      `${chalk.bold(organization.label)}${deleted} ${chalk.dim(
        `${organization.slug} · ${organization.category} · ${tier}`
      )}`
    );
    print(
      `  ${organization.id} · ${organization.ownerEmail ?? 'no owner email'} · ${
        organization.memberCount
      } members · created ${organization.createdAt.slice(0, 10)}`
    );
  }
}

const FUNNEL_STEP_LABELS: Record<OnboardingFunnelStep, string> = {
  accountConnected: 'social account connected',
  brandScanned: 'brand scanned',
  completed: 'onboarding completed',
  draftsReady: 'drafts ready',
  draftsStarted: 'drafts started',
  published: 'post published',
  websiteLink: 'website saved',
};

function formatFunnelBucket(label: string, bucket: IOnboardingFunnelBucket): void {
  print(chalk.bold(`${label}: ${bucket.total} organizations`));
  for (const [step, stepLabel] of Object.entries(FUNNEL_STEP_LABELS)) {
    const count = bucket.steps[step as OnboardingFunnelStep];
    const share = bucket.total > 0 ? Math.round((count / bucket.total) * 100) : 0;
    print(`  ${stepLabel.padEnd(22)} ${String(count).padStart(4)}  ${chalk.dim(`${share}%`)}`);
  }
}

async function runOnboardingFunnel(options: { days: number; isJson: boolean }): Promise<void> {
  const report = await readOnboardingFunnel(options.days);
  if (options.isJson) {
    printJson(report);
    return;
  }

  print(formatHeader(`Onboarding funnel, last ${report.windowDays} days\n`));
  formatFunnelBucket('All', report.totals);
  for (const emailClass of ['personal', 'company', 'unknown'] as const) {
    print('');
    formatFunnelBucket(emailClass, report.byEmailClass[emailClass]);
  }
  print(chalk.dim('\nInternal organizations are not excluded; use --json and filter by id.'));
}

async function runHarnessActivation(options: {
  expect?: string[];
  isJson: boolean;
}): Promise<void> {
  const report = await readHarnessActivation();
  const missing = findMissingExternalPacks(report, options.expect ?? []);

  if (options.isJson) {
    printJson({ ...report, missingExternalPackIds: missing });
  } else {
    print(formatHeader(`${report.packs.length} content harness packs loaded\n`));
    const externalPackIds = new Set(
      report.external.filter((item) => item.state === 'loaded').map((item) => item.packId)
    );
    for (const pack of report.packs) {
      // An external pack reusing a built-in id replaces that built-in.
      const source = externalPackIds.has(pack.id) ? 'external' : 'built-in';
      print(`${chalk.bold(pack.id)} ${chalk.dim(`${pack.version} · ${source}`)}`);
    }
    print();
    if (report.external.length === 0) {
      print(chalk.dim('No external packs configured'));
    }
    for (const activation of report.external) {
      const state =
        activation.state === 'loaded' ? chalk.green(activation.state) : chalk.red(activation.state);
      const pack = activation.packId
        ? ` ${activation.packId}@${activation.packVersion ?? 'unknown'}`
        : '';
      print(`${state} ${activation.specifier}${pack}`);
      if (activation.error) print(chalk.dim(`  ${activation.error}`));
    }
  }

  if (missing.length > 0) {
    throw new GenfeedError(`Expected external packs not loaded: ${missing.join(', ')}`);
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
    .description('Review, fix and approve provider price changes')
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
      new Command('fix')
        .description(
          'Re-apply the reviewed rate sheet, approve pending rates and queue imports (dry run unless --yes)'
        )
        .argument('[models...]', 'Model ids or keys (every model that needs it when omitted)')
        .option('--yes', 'Fix instead of previewing')
        .action(async (models: string[], options: { yes?: boolean }) => {
          try {
            await runPricingFix(models, options);
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
  const brand = new Command('brand')
    .description('Review the system brand kit; create and scan brands inside any organization')
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
  for (const subcommand of createOrganizationBrandSubcommands()) brand.addCommand(subcommand);
  return brand;
}

function createOrganizationBrandSubcommands(): Command[] {
  return [
    new Command('create')
      .description('Create a brand inside any organization (preview unless --yes)')
      .requiredOption('--org <organizationId>', 'Organization id')
      .requiredOption('--label <label>', 'Brand name')
      .option('--description <text>', 'Brand description')
      .option('--font-family <fontFamily>', 'FontFamily enum value (default INTER_BOLD)')
      .option('--primary-color <hex>', 'Primary color')
      .option('--secondary-color <hex>', 'Secondary color')
      .option('--background-color <hex>', 'Background color')
      .option('--yes', 'Create the brand')
      .action(async (options: OrganizationBrandCreateOptions) => {
        try {
          const input: OrganizationBrandInput = {
            backgroundColor: options.backgroundColor,
            description: options.description,
            fontFamily: options.fontFamily,
            label: options.label,
            primaryColor: options.primaryColor,
            secondaryColor: options.secondaryColor,
          };
          if (!options.yes) {
            print(formatHeader('Brand create (preview)\n'));
            print(formatLabel('Organization', options.org));
            print(formatLabel('Label', options.label));
            print(formatWarning('Re-run with --yes to create the brand.'));
            return;
          }
          const brand = await createOrganizationBrand(options.org, input);
          print(formatSuccess(`Created brand ${brand.label} (${brand.id}, slug ${brand.slug})`));
        } catch (error) {
          handleError(error);
        }
      }),
    new Command('scan')
      .description('Scan a website or social profile into the brand kit (preview unless --yes)')
      .requiredOption('--org <organizationId>', 'Organization id')
      .requiredOption('--brand <brandId>', 'Brand id')
      .requiredOption('--url <url>', 'Website or social profile URL to scan')
      .option('--yes', 'Run the scan')
      .option('--json', 'Output as JSON')
      .action(async (options: OrganizationBrandScanOptions, command: Command) => {
        try {
          if (!options.yes) {
            print(formatHeader('Brand scan (preview)\n'));
            print(formatLabel('Organization', options.org));
            print(formatLabel('Brand', options.brand));
            print(formatLabel('URL', options.url));
            print(formatWarning('Re-run with --yes to scan and overwrite scraped brand fields.'));
            return;
          }
          const scan = await scanOrganizationBrand(options.org, options.brand, options.url);
          if (wantsJson(command)) {
            printJson(scan);
            return;
          }
          print(formatLabel('Status', scan.scrapeStatus));
          if (scan.scrapeReason) print(formatLabel('Reason', scan.scrapeReason));
        } catch (error) {
          handleError(error);
        }
      }),
  ];
}

function createCreditsCommand(): Command {
  return new Command('credits').description('Grant credits to an organization').addCommand(
    new Command('grant')
      .description('Grant credits to an organization (preview unless --yes)')
      .argument('<organizationId>', 'Organization id')
      .requiredOption('--amount <credits>', 'Credits to grant (1-100000)', Number)
      .requiredOption('--reason <text>', 'Audit reason (8-500 characters)')
      .option('--expires-in-days <days>', 'Expire the grant after N days', Number)
      .option('--idempotency-key <key>', 'Stable key so a retry cannot double-grant')
      .option('--yes', 'Apply the grant')
      .action(async (organizationId: string, options: CreditsGrantOptions) => {
        try {
          if (!options.yes) {
            print(formatHeader('Credit grant (preview)\n'));
            print(formatLabel('Organization', organizationId));
            print(formatLabel('Amount', String(options.amount)));
            print(formatLabel('Reason', options.reason));
            print(formatWarning('Re-run with --yes to grant the credits.'));
            return;
          }
          const grant = await grantOrganizationCredits(organizationId, {
            amount: options.amount,
            expiresInDays: options.expiresInDays,
            idempotencyKey: options.idempotencyKey,
            reason: options.reason,
          });
          print(
            formatSuccess(`Granted ${grant.creditsGranted} credits (balance ${grant.balance})`)
          );
        } catch (error) {
          handleError(error);
        }
      })
  );
}

function createWarmupCommand(): Command {
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
        .option('--yes', 'Run the action')
        .option('--json', 'Output as JSON')
        .action(async (accountId: string, options: WarmupPrepareOptions, command: Command) => {
          try {
            const input: WarmupPrepareInput = {
              action: options.action,
              amount: options.amount,
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

export const adminCommand = new Command('admin')
  .description(
    'Super admin one-offs over the API: organization apps, harness packs, pricing, seeds and the system brand'
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
  .addCommand(
    new Command('trainings')
      .description('Read LoRA trainings across organizations: totals by status, newest first')
      .option('--limit <n>', 'How many trainings to list', '10')
      .option('--json', 'Output as JSON')
      .action(async (options: { limit: string }, command: Command) => {
        try {
          await runTrainings({
            isJson: wantsJson(command),
            limit: Math.max(1, Number.parseInt(options.limit, 10) || 10),
          });
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(
    new Command('orgs').description('Read organizations on the platform').addCommand(
      new Command('list')
        .description('List every organization with owner, tier, category and member count')
        .option('--include-deleted', 'Also list soft-deleted organizations')
        .option('--json', 'Output as JSON')
        .action(async (options: { includeDeleted?: boolean }, command: Command) => {
          try {
            await runOrganizationsList({
              includeDeleted: options.includeDeleted,
              isJson: wantsJson(command),
            });
          } catch (error) {
            handleError(error);
          }
        })
    )
  )
  .addCommand(
    new Command('onboarding-funnel')
      .description('Show how recent organizations moved through onboarding, by owner email class')
      .option('--days <days>', 'How many days back to include (1-90)', '30')
      .option('--json', 'Output as JSON')
      .action(async (options: { days: string }, command: Command) => {
        try {
          const days = Number.parseInt(options.days, 10);
          if (!Number.isInteger(days) || days < 1 || days > 90) {
            throw new GenfeedError('--days must be a whole number from 1 to 90');
          }
          await runOnboardingFunnel({ days, isJson: wantsJson(command) });
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(
    new Command('harness')
      .description('Show the content harness packs the API process loaded, with versions')
      .option(
        '--expect <packIds...>',
        'Fail unless each pack id is loaded from a configured external pack'
      )
      .option('--json', 'Output as JSON')
      .action(async (options: { expect?: string[] }, command: Command) => {
        try {
          await runHarnessActivation({ expect: options.expect, isJson: wantsJson(command) });
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(createPricingCommand())
  .addCommand(createSeedCommand())
  .addCommand(createBrandCommand())
  .addCommand(createCreditsCommand())
  .addCommand(createWarmupCommand());

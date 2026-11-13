import type {
  IOnboardingFunnelBucket,
  OnboardingFunnelStep,
} from '@genfeedai/contracts/interfaces';
import chalk from 'chalk';
import { Command } from 'commander';
import { readOnboardingDrafts, readOnboardingFunnel } from '@/operations/admin';
import { formatHeader, print, printJson } from '@/ui/theme';
import { GenfeedError, handleError } from '@/utils/errors';
import { wantsJson } from '@/utils/options';

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

function formatVerdict(verdict: 'down' | 'up' | null, reasons: string[]): string {
  if (verdict === 'up') return chalk.green("I'd post this");
  if (verdict === 'down') {
    return chalk.red(reasons.length > 0 ? `Not for me (${reasons.join(', ')})` : 'Not for me');
  }
  return chalk.dim('no verdict');
}

async function runOnboardingDrafts(options: {
  days: number;
  isJson: boolean;
  limit: number;
}): Promise<void> {
  const review = await readOnboardingDrafts(options.days, options.limit);
  if (options.isJson) {
    printJson(review);
    return;
  }

  print(formatHeader(`Onboarding drafts, last ${review.windowDays} days\n`));
  if (review.runs.length === 0) {
    print(chalk.dim('No organization finished the first-run drafts in this window.'));
    return;
  }
  for (const run of review.runs) {
    print(
      chalk.bold(
        `${run.organizationId} · ${run.brandName ?? 'no brand name'} · ${run.emailClass} · ${
          run.draftsStatus ?? 'no status'
        } · ${run.hasMasterImage ? 'image' : 'no image'} · ${run.createdAt.slice(0, 16)}`
      )
    );
    for (const draft of run.drafts) {
      print(
        `  ${chalk.cyan(draft.platform.padEnd(10))} ${formatVerdict(draft.verdict, draft.reasons)}`
      );
      for (const line of draft.text.split('\n')) print(`    ${line}`);
    }
    print('');
  }
  print(chalk.dim('Internal organizations are not excluded; use --json and filter by id.'));
}

export function createOnboardingFunnelCommand(): Command {
  return new Command('onboarding-funnel')
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
    });
}

export function createOnboardingDraftsCommand(): Command {
  return new Command('onboarding-drafts')
    .description(
      'Read the first-run posts recent organizations were shown, with their "I\'d post this" or "Not for me" verdicts'
    )
    .option('--days <days>', 'How many days back to include (1-90)', '7')
    .option('--limit <limit>', 'How many organizations to show, newest first (1-50)', '20')
    .option('--json', 'Output as JSON')
    .action(async (options: { days: string; limit: string }, command: Command) => {
      try {
        const days = Number.parseInt(options.days, 10);
        if (!Number.isInteger(days) || days < 1 || days > 90) {
          throw new GenfeedError('--days must be a whole number from 1 to 90');
        }
        const limit = Number.parseInt(options.limit, 10);
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
          throw new GenfeedError('--limit must be a whole number from 1 to 50');
        }
        await runOnboardingDrafts({ days, isJson: wantsJson(command), limit });
      } catch (error) {
        handleError(error);
      }
    });
}

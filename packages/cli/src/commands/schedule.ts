import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client';
import {
  type BulkScheduleItem,
  bulkSchedule,
  cancelScheduledRelease,
  getCalendar,
  getOptimalTimes,
  getScheduledRelease,
  rescheduleScheduledRelease,
} from '@/api/schedules';
import { getActiveBrand } from '@/config/store';
import {
  formatHeader,
  formatLabel,
  formatSuccess,
  formatWarning,
  print,
  printJson,
} from '@/ui/theme';
import { GenfeedError, handleError, NoBrandError } from '@/utils/errors';

export const scheduleCommand = new Command('schedule').description(
  'Content scheduling and calendar'
);

scheduleCommand
  .command('status')
  .description('Read a scheduled release status')
  .argument('<release-id>', 'Scheduled release ID')
  .option('--json', 'Output as JSON')
  .action(async (releaseId, options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching scheduled release...').start();
      const release = await getScheduledRelease(releaseId);
      spinner.stop();

      if (options.json) {
        printJson(release);
        return;
      }

      print(formatHeader('\nScheduled Release:\n'));
      print(formatLabel('ID', release.id));
      print(formatLabel('Title', release.title));
      print(formatLabel('Status', release.status));
      if (release.scheduledAt) {
        print(formatLabel('Scheduled', new Date(release.scheduledAt).toLocaleString()));
      }
      print(formatLabel('Timezone', release.timezone));
      print(formatLabel('Targets', String(release.targets?.length ?? 0)));
    } catch (error) {
      handleError(error);
    }
  });

scheduleCommand
  .command('cancel')
  .description('Cancel a scheduled release')
  .argument('<release-id>', 'Scheduled release ID')
  .option('-f, --force', 'Skip confirmation')
  .option('--json', 'Output as JSON')
  .action(async (releaseId, options) => {
    try {
      await requireAuth();

      if (!options.force) {
        const confirmed = await confirm({
          default: false,
          message: `Cancel scheduled release ${releaseId}?`,
        });
        if (!confirmed) {
          print(formatWarning('Cancellation aborted'));
          return;
        }
      }

      const spinner = ora('Cancelling scheduled release...').start();
      const release = await cancelScheduledRelease(releaseId);
      spinner.succeed('Scheduled release cancelled');

      if (options.json) {
        printJson(release);
        return;
      }

      print(formatSuccess('Scheduled release cancelled'));
      print(formatLabel('ID', release.id));
      print(formatLabel('Status', release.status));
    } catch (error) {
      handleError(error);
    }
  });

scheduleCommand
  .command('reschedule')
  .description('Move a scheduled release to a new date')
  .argument('<release-id>', 'Scheduled release ID')
  .requiredOption('--scheduled-at <iso>', 'New scheduled date in ISO-8601 format')
  .option('--json', 'Output as JSON')
  .action(async (releaseId, options) => {
    try {
      await requireAuth();

      const spinner = ora('Rescheduling release...').start();
      const release = await rescheduleScheduledRelease(releaseId, options.scheduledAt);
      spinner.succeed('Scheduled release rescheduled');

      if (options.json) {
        printJson(release);
        return;
      }

      print(formatSuccess('Scheduled release rescheduled'));
      print(formatLabel('ID', release.id));
      print(formatLabel('Status', release.status));
      if (release.scheduledAt) {
        print(formatLabel('Scheduled', new Date(release.scheduledAt).toLocaleString()));
      }
    } catch (error) {
      handleError(error);
    }
  });

scheduleCommand
  .command('calendar')
  .description('View scheduled content calendar')
  .option('--start <iso>', 'Start date (default: now)')
  .option('--end <iso>', 'End date (default: +30 days)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching calendar...').start();
      const entries = await getCalendar(options.start, options.end);
      spinner.stop();

      if (entries.length === 0) {
        print(chalk.dim('No scheduled content found.'));
        return;
      }

      if (options.json) {
        printJson(entries);
        return;
      }

      print(formatHeader(`\nSchedule (${entries.length} entries):\n`));

      for (const entry of entries) {
        const date = new Date(entry.scheduledAt).toLocaleString();
        const platform = entry.platform ? chalk.blue(`[${entry.platform}]`) : '';
        const status = entry.status
          ? entry.status === 'published'
            ? chalk.green(entry.status)
            : chalk.dim(entry.status)
          : '';

        print(`  ${chalk.dim(date)} ${platform} ${status}`);
        if (entry.title) {
          print(`    ${entry.title}`);
        }
        print(`    ${chalk.dim(entry.id)}`);
        print();
      }
    } catch (error) {
      handleError(error);
    }
  });

function parseBulkItems(value: string): BulkScheduleItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new GenfeedError('--items must be a JSON array');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new GenfeedError('--items must be a non-empty JSON array');
  }

  const seen = new Set<string>();
  return parsed.map((entry: unknown, index) => {
    const item = entry as Partial<Record<keyof BulkScheduleItem, unknown>> | null;
    const { contentId, platform, scheduledAt } = item ?? {};
    if (
      typeof contentId !== 'string' ||
      typeof platform !== 'string' ||
      typeof scheduledAt !== 'string' ||
      !contentId ||
      !platform
    ) {
      throw new GenfeedError(
        `--items[${index}] needs a contentId, a platform and a scheduledAt, all strings`
      );
    }
    if (Number.isNaN(Date.parse(scheduledAt))) {
      throw new GenfeedError(`--items[${index}].scheduledAt is not a date: ${scheduledAt}`);
    }
    const key = `${platform}:${contentId}`;
    if (seen.has(key)) {
      throw new GenfeedError(`--items lists ${contentId} twice for ${platform}`);
    }
    seen.add(key);
    return { contentId, platform, scheduledAt };
  });
}

scheduleCommand
  .command('bulk')
  .description('Schedule several content items, each at its own time')
  .requiredOption(
    '--items <json>',
    'JSON array of {"contentId", "platform", "scheduledAt"} objects'
  )
  .option('--brand <id>', 'Brand to schedule for (default: the brand set with `gf brand use`)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const items = parseBulkItems(options.items);
      const brandId = options.brand ?? (await getActiveBrand());
      if (!brandId) {
        throw new NoBrandError();
      }

      const spinner = ora(`Scheduling ${items.length} items...`).start();
      const { failed, scheduled } = await bulkSchedule(brandId, items);
      const summary = `${scheduled.length} of ${items.length} items scheduled`;
      if (failed.length > 0) {
        spinner.warn(summary);
        process.exitCode = 1;
      } else {
        spinner.succeed(summary);
      }

      if (options.json) {
        printJson({ failed, scheduled });
        return;
      }

      print(formatSuccess(`Scheduled ${scheduled.length} items`));
      for (const entry of scheduled) {
        print(formatLabel('ID', entry.id));
        print(formatLabel('Scheduled', new Date(entry.scheduledAt).toLocaleString()));
        print();
      }
      for (const failure of failed) {
        print(formatWarning(`${failure.contentId}: ${failure.reason}`));
      }
    } catch (error) {
      handleError(error);
    }
  });

scheduleCommand
  .command('optimal')
  .description('Get optimal posting times')
  .option('--platform <platform>', 'Target platform')
  .option('--timezone <tz>', 'Timezone')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Calculating optimal times...').start();
      const times = await getOptimalTimes(options.platform, options.timezone);
      spinner.stop();

      if (times.length === 0) {
        print(chalk.dim('No optimal time data available.'));
        return;
      }

      if (options.json) {
        printJson(times);
        return;
      }

      print(formatHeader('\nOptimal Posting Times:\n'));

      for (const t of times) {
        const bar = chalk.green('|'.repeat(Math.round(t.score / 5)));
        print(
          `  ${chalk.blue(t.platform.padEnd(12))} ${t.day.padEnd(10)} ${String(t.hour).padStart(2, '0')}:00 ${t.timezone}  ${bar}`
        );
      }
    } catch (error) {
      handleError(error);
    }
  });

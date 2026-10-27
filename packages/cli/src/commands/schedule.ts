import type { PostingTimeWindow } from '@genfeedai/contracts/interfaces';
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
  getOptimalTime,
  getScheduledRelease,
  rescheduleScheduledRelease,
} from '@/api/schedules';
import {
  formatHeader,
  formatLabel,
  formatSuccess,
  formatWarning,
  print,
  printJson,
} from '@/ui/theme';
import { handleError } from '@/utils/errors';

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

scheduleCommand
  .command('bulk')
  .description('Schedule multiple content items')
  .requiredOption('--items <json>', 'JSON array of items to schedule')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const items = JSON.parse(options.items) as BulkScheduleItem[];

      const spinner = ora(`Scheduling ${items.length} items...`).start();
      const scheduled = await bulkSchedule(items);
      spinner.succeed(`${scheduled.length} items scheduled`);

      if (options.json) {
        printJson(scheduled);
      } else {
        print(formatSuccess(`Scheduled ${scheduled.length} items`));
        for (const entry of scheduled) {
          print(formatLabel('ID', entry.id));
          print(formatLabel('Scheduled', new Date(entry.scheduledAt).toLocaleString()));
          print();
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatPostingWindow(window: PostingTimeWindow): string {
  const day = window.weekday === null ? 'Every day' : (WEEKDAYS[window.weekday] ?? '?');
  const hours = `${String(window.startHour).padStart(2, '0')}:00-${String(window.endHour).padStart(2, '0')}:00`;
  if (window.median === null || window.sampleCount === null) {
    return `  ${day.padEnd(9)} ${hours}`;
  }
  return `  ${day.padEnd(9)} ${hours}  median ${window.median.toFixed(4)} from ${window.sampleCount} posts`;
}

scheduleCommand
  .command('optimal')
  .description('Get the best posting windows for a platform')
  .requiredOption('--platform <platform>', 'Target platform (twitter, instagram, linkedin, ...)')
  .option('--timezone <tz>', 'IANA timezone for the windows (default UTC)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Reading your posting history...').start();
      const recommendation = await getOptimalTime(options.platform, options.timezone);
      spinner.stop();

      if (options.json) {
        printJson(recommendation);
        return;
      }

      const title =
        recommendation.basis === 'learned' ? 'Learned from your posts' : 'Default times';
      print(
        formatHeader(`\n${title} for ${recommendation.platform} (${recommendation.timezone}):\n`)
      );

      for (const window of recommendation.windows) {
        print(formatPostingWindow(window));
      }

      print();
      for (const line of recommendation.reasoning) {
        print(chalk.dim(line));
      }
    } catch (error) {
      handleError(error);
    }
  });

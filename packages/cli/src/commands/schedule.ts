import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client';
import { type BulkScheduleItem, bulkSchedule, getCalendar, getOptimalTimes } from '@/api/schedules';
import { formatHeader, formatLabel, formatSuccess, print, printJson } from '@/ui/theme';
import { handleError } from '@/utils/errors';

export const scheduleCommand = new Command('schedule').description(
  'Content scheduling and calendar'
);

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

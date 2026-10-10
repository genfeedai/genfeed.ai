import { TurboRunItemStatus, TurboRunStatus } from '@genfeedai/contracts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client';
import {
  cancelTurboRun,
  createTurboRun,
  getTurboRun,
  listTurboRuns,
  turboRunItemAction,
} from '@/api/turbo-runs';
import { getActiveBrand } from '@/config/store';
import { formatHeader, formatLabel, formatSuccess, print, printJson } from '@/ui/theme';
import { GenfeedError, handleError, NoBrandError } from '@/utils/errors';
import { parsePositiveInteger } from '@/utils/options';

const TURBO_RUN_STATUS_VALUES = Object.values(TurboRunStatus);

/**
 * `--status` is user input, so accept the friendlier lowercase spelling and
 * resolve it to the SCREAMING_SNAKE wire value the API filters on.
 *
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
function parseTurboRunStatusFilter(value: string | undefined): TurboRunStatus | undefined {
  if (!value) return undefined;

  const normalized = value.trim().toUpperCase();
  const match = TURBO_RUN_STATUS_VALUES.find((status) => status === normalized);

  if (!match) {
    throw new GenfeedError(
      `Unknown run status: ${value}`,
      `Expected one of: ${TURBO_RUN_STATUS_VALUES.join(', ')}`
    );
  }

  return match;
}

export const turboCommand = new Command('turbo').description('Turbo content generation');

turboCommand
  .command('create')
  .description('Create a Turbo content generation job')
  .requiredOption('-n, --count <n>', 'Number of content pieces (1-100)', parsePositiveInteger)
  .requiredOption('-p, --platforms <list>', 'Comma-separated target platforms')
  .option('-b, --brand <id>', 'Brand ID (overrides active brand)')
  .option('--topics <list>', 'Comma-separated content topics')
  .option('--style <style>', 'Style direction (lifestyle, professional, urban, etc.)')
  .option('--start <iso>', 'Schedule start date (ISO-8601)')
  .option('--end <iso>', 'Schedule end date (ISO-8601)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const activeBrandId = await getActiveBrand();
      const brandId = options.brand ?? activeBrandId;
      if (!brandId) {
        throw new NoBrandError();
      }

      const platforms = options.platforms.split(',').map((p: string) => p.trim());
      const topics = options.topics
        ? options.topics.split(',').map((t: string) => t.trim())
        : undefined;

      const spinner = ora('Creating run...').start();

      const turboRun = await createTurboRun({
        brandId,
        count: options.count,
        endDate: options.end,
        platforms,
        startDate: options.start,
        style: options.style,
        topics,
      });

      spinner.succeed('Turbo run created');

      if (options.json) {
        printJson(turboRun);
      } else {
        print(formatLabel('Turbo run ID', turboRun.id));
        print(formatLabel('Status', turboRun.status));
        print(formatLabel('Count', String(turboRun.count)));
        print(formatLabel('Platforms', turboRun.platforms.join(', ')));
        print();
        print(chalk.dim(`Check status with: gf turbo show ${turboRun.id}`));
      }
    } catch (error) {
      handleError(error);
    }
  });

turboCommand
  .command('list')
  .description('List run jobs')
  .option('--status <status>', `Filter by status (${TURBO_RUN_STATUS_VALUES.join(', ')})`)
  .option('-l, --limit <n>', 'Max items to return', parsePositiveInteger, 20)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching runs...').start();
      const turboRuns = await listTurboRuns({
        limit: options.limit,
        status: parseTurboRunStatusFilter(options.status),
      });
      spinner.stop();

      if (turboRuns.length === 0) {
        print(chalk.dim('No runs found.'));
        return;
      }

      if (options.json) {
        printJson(turboRuns);
        return;
      }

      print(formatHeader(`\nTurboRuns (${turboRuns.length}):\n`));

      for (const turboRun of turboRuns) {
        const statusColor =
          turboRun.status === TurboRunStatus.COMPLETED
            ? chalk.green(turboRun.status)
            : turboRun.status === TurboRunStatus.FAILED
              ? chalk.red(turboRun.status)
              : turboRun.status === TurboRunStatus.PROCESSING
                ? chalk.yellow(turboRun.status)
                : chalk.dim(turboRun.status);

        print(`  ${chalk.cyan(turboRun.id)} ${statusColor}`);
        print(`    ${chalk.dim(`${turboRun.count} items | ${turboRun.platforms.join(', ')}`)}`);
        print();
      }
    } catch (error) {
      handleError(error);
    }
  });

turboCommand
  .command('show')
  .description('Show run details')
  .argument('<id>', 'Turbo run ID')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching run...').start();
      const turboRun = await getTurboRun(id);
      spinner.stop();

      if (options.json) {
        printJson(turboRun);
        return;
      }

      print(formatHeader('\nTurboRun Details:\n'));
      print(formatLabel('ID', turboRun.id));
      print(formatLabel('Status', turboRun.status));
      print(formatLabel('Count', String(turboRun.count)));
      print(formatLabel('Platforms', turboRun.platforms.join(', ')));
      if (turboRun.topics?.length) {
        print(formatLabel('Topics', turboRun.topics.join(', ')));
      }
      if (turboRun.style) {
        print(formatLabel('Style', turboRun.style));
      }
      if (turboRun.completedItems !== undefined) {
        print(formatLabel('Completed', String(turboRun.completedItems)));
      }
      if (turboRun.failedItems !== undefined) {
        print(formatLabel('Failed', String(turboRun.failedItems)));
      }

      if (turboRun.items?.length) {
        print();
        print(formatHeader('Items:\n'));
        for (const item of turboRun.items) {
          const statusColor =
            item.status === TurboRunItemStatus.COMPLETED
              ? chalk.green(item.status)
              : item.status === TurboRunItemStatus.FAILED
                ? chalk.red(item.status)
                : chalk.dim(item.status);

          print(`  ${chalk.dim(item.id)} ${statusColor}`);
          if (item.platform) {
            print(`    ${chalk.dim(`Platform: ${item.platform}`)}`);
          }
          if (item.title) {
            print(`    ${chalk.dim(item.title)}`);
          }
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

turboCommand
  .command('approve')
  .description('Approve Turbo run items')
  .argument('<id>', 'Turbo run ID')
  .argument('[itemIds...]', 'Specific item IDs to approve (all if omitted)')
  .option('--json', 'Output as JSON')
  .action(async (id, itemIds, options) => {
    try {
      await requireAuth();

      const spinner = ora('Approving items...').start();
      await turboRunItemAction(id, {
        action: 'approve',
        itemIds: itemIds.length > 0 ? itemIds : undefined,
      });
      spinner.succeed('Items approved');

      if (options.json) {
        printJson({
          action: 'approve',
          itemIds: itemIds.length > 0 ? itemIds : 'all',
          turboRunId: id,
        });
      } else {
        print(formatSuccess(`Approved items in run ${id}`));
      }
    } catch (error) {
      handleError(error);
    }
  });

turboCommand
  .command('reject')
  .description('Reject Turbo run items')
  .argument('<id>', 'Turbo run ID')
  .argument('[itemIds...]', 'Specific item IDs to reject (all if omitted)')
  .option('--json', 'Output as JSON')
  .action(async (id, itemIds, options) => {
    try {
      await requireAuth();

      const spinner = ora('Rejecting items...').start();
      await turboRunItemAction(id, {
        action: 'reject',
        itemIds: itemIds.length > 0 ? itemIds : undefined,
      });
      spinner.succeed('Items rejected');

      if (options.json) {
        printJson({
          action: 'reject',
          itemIds: itemIds.length > 0 ? itemIds : 'all',
          turboRunId: id,
        });
      } else {
        print(formatSuccess(`Rejected items in run ${id}`));
      }
    } catch (error) {
      handleError(error);
    }
  });

turboCommand
  .command('cancel')
  .description('Cancel a running run')
  .argument('<id>', 'Turbo run ID')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      await requireAuth();

      const spinner = ora('Cancelling run...').start();
      await cancelTurboRun(id);
      spinner.succeed('Turbo run cancelled');

      if (options.json) {
        printJson({ status: TurboRunStatus.CANCELLED, turboRunId: id });
      } else {
        print(formatSuccess(`Turbo run ${id} cancelled`));
      }
    } catch (error) {
      handleError(error);
    }
  });

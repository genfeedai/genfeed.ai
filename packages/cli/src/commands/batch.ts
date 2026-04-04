import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { batchItemAction, cancelBatch, createBatch, getBatch, listBatches } from '@/api/batches.js';
import { requireAuth } from '@/api/client.js';
import { getActiveBrand } from '@/config/store.js';
import { formatHeader, formatLabel, formatSuccess, print, printJson } from '@/ui/theme.js';
import { handleError, NoBrandError } from '@/utils/errors.js';

export const batchCommand = new Command('batch').description('Batch content generation');

batchCommand
  .command('create')
  .description('Create a batch content generation job')
  .requiredOption('-n, --count <n>', 'Number of content pieces (1-100)', Number.parseInt)
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

      const spinner = ora('Creating batch...').start();

      const batch = await createBatch({
        brand: brandId,
        count: options.count,
        endDate: options.end,
        platforms,
        startDate: options.start,
        style: options.style,
        topics,
      });

      spinner.succeed('Batch created');

      if (options.json) {
        printJson(batch);
      } else {
        print(formatLabel('Batch ID', batch.id));
        print(formatLabel('Status', batch.status));
        print(formatLabel('Count', String(batch.count)));
        print(formatLabel('Platforms', batch.platforms.join(', ')));
        print();
        print(chalk.dim(`Check status with: gf batch show ${batch.id}`));
      }
    } catch (error) {
      handleError(error);
    }
  });

batchCommand
  .command('list')
  .description('List batch jobs')
  .option('--status <status>', 'Filter by status (pending, processing, completed, failed)')
  .option('-l, --limit <n>', 'Max items to return', Number.parseInt, 20)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching batches...').start();
      const batches = await listBatches({
        limit: options.limit,
        status: options.status,
      });
      spinner.stop();

      if (batches.length === 0) {
        print(chalk.dim('No batches found.'));
        return;
      }

      if (options.json) {
        printJson(batches);
        return;
      }

      print(formatHeader(`\nBatches (${batches.length}):\n`));

      for (const batch of batches) {
        const statusColor =
          batch.status === 'completed'
            ? chalk.green(batch.status)
            : batch.status === 'failed'
              ? chalk.red(batch.status)
              : batch.status === 'processing'
                ? chalk.yellow(batch.status)
                : chalk.dim(batch.status);

        print(`  ${chalk.cyan(batch.id)} ${statusColor}`);
        print(`    ${chalk.dim(`${batch.count} items | ${batch.platforms.join(', ')}`)}`);
        print();
      }
    } catch (error) {
      handleError(error);
    }
  });

batchCommand
  .command('show')
  .description('Show batch details')
  .argument('<id>', 'Batch ID')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching batch...').start();
      const batch = await getBatch(id);
      spinner.stop();

      if (options.json) {
        printJson(batch);
        return;
      }

      print(formatHeader('\nBatch Details:\n'));
      print(formatLabel('ID', batch.id));
      print(formatLabel('Status', batch.status));
      print(formatLabel('Count', String(batch.count)));
      print(formatLabel('Platforms', batch.platforms.join(', ')));
      if (batch.topics?.length) {
        print(formatLabel('Topics', batch.topics.join(', ')));
      }
      if (batch.style) {
        print(formatLabel('Style', batch.style));
      }
      if (batch.completedItems !== undefined) {
        print(formatLabel('Completed', String(batch.completedItems)));
      }
      if (batch.failedItems !== undefined) {
        print(formatLabel('Failed', String(batch.failedItems)));
      }

      if (batch.items?.length) {
        print();
        print(formatHeader('Items:\n'));
        for (const item of batch.items) {
          const statusColor =
            item.status === 'completed'
              ? chalk.green(item.status)
              : item.status === 'failed'
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

batchCommand
  .command('approve')
  .description('Approve batch items')
  .argument('<id>', 'Batch ID')
  .argument('[itemIds...]', 'Specific item IDs to approve (all if omitted)')
  .option('--json', 'Output as JSON')
  .action(async (id, itemIds, options) => {
    try {
      await requireAuth();

      const spinner = ora('Approving items...').start();
      await batchItemAction(id, {
        action: 'approve',
        itemIds: itemIds.length > 0 ? itemIds : undefined,
      });
      spinner.succeed('Items approved');

      if (options.json) {
        printJson({
          action: 'approve',
          batchId: id,
          itemIds: itemIds.length > 0 ? itemIds : 'all',
        });
      } else {
        print(formatSuccess(`Approved items in batch ${id}`));
      }
    } catch (error) {
      handleError(error);
    }
  });

batchCommand
  .command('reject')
  .description('Reject batch items')
  .argument('<id>', 'Batch ID')
  .argument('[itemIds...]', 'Specific item IDs to reject (all if omitted)')
  .option('--json', 'Output as JSON')
  .action(async (id, itemIds, options) => {
    try {
      await requireAuth();

      const spinner = ora('Rejecting items...').start();
      await batchItemAction(id, {
        action: 'reject',
        itemIds: itemIds.length > 0 ? itemIds : undefined,
      });
      spinner.succeed('Items rejected');

      if (options.json) {
        printJson({ action: 'reject', batchId: id, itemIds: itemIds.length > 0 ? itemIds : 'all' });
      } else {
        print(formatSuccess(`Rejected items in batch ${id}`));
      }
    } catch (error) {
      handleError(error);
    }
  });

batchCommand
  .command('cancel')
  .description('Cancel a running batch')
  .argument('<id>', 'Batch ID')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      await requireAuth();

      const spinner = ora('Cancelling batch...').start();
      await cancelBatch(id);
      spinner.succeed('Batch cancelled');

      if (options.json) {
        printJson({ batchId: id, status: 'cancelled' });
      } else {
        print(formatSuccess(`Batch ${id} cancelled`));
      }
    } catch (error) {
      handleError(error);
    }
  });

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client.js';
import { getPromptPerformance, getTopPerformers, getWeeklySummary } from '@/api/performance.js';
import { getActiveBrand } from '@/config/store.js';
import { formatHeader, formatLabel, print, printJson } from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';

export const performanceCommand = new Command('performance').description(
  'Content performance analytics'
);

performanceCommand
  .command('weekly')
  .description('Show weekly performance summary')
  .option('-b, --brand <id>', 'Brand ID (overrides active brand)')
  .option('--top <n>', 'Number of top performers', Number.parseInt, 5)
  .option('--worst <n>', 'Number of worst performers', Number.parseInt, 5)
  .option('--start <iso>', 'Start date')
  .option('--end <iso>', 'End date')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const activeBrandId = await getActiveBrand();
      const brandId = options.brand ?? activeBrandId;

      const spinner = ora('Fetching weekly summary...').start();
      const summary = await getWeeklySummary({
        brand: brandId,
        end: options.end,
        start: options.start,
        top: options.top,
        worst: options.worst,
      });
      spinner.stop();

      if (options.json) {
        printJson(summary);
        return;
      }

      print(formatHeader('\nWeekly Performance Summary:\n'));
      print(formatLabel('Period', summary.period));
      print(formatLabel('Total Posts', String(summary.totalPosts)));
      print(formatLabel('Total Engagement', String(summary.totalEngagement)));
      print(formatLabel('Avg Engagement Rate', `${summary.averageEngagementRate.toFixed(2)}%`));

      if (summary.topPerformers.length > 0) {
        print();
        print(formatHeader('Top Performers:\n'));
        for (const item of summary.topPerformers) {
          const rate =
            item.engagementRate !== undefined
              ? chalk.green(`${item.engagementRate.toFixed(2)}%`)
              : '';
          print(`  ${chalk.cyan(item.title ?? item.id)} ${rate}`);
          if (item.platform) {
            print(`    ${chalk.dim(item.platform)}`);
          }
        }
      }

      if (summary.worstPerformers.length > 0) {
        print();
        print(formatHeader('Needs Improvement:\n'));
        for (const item of summary.worstPerformers) {
          const rate =
            item.engagementRate !== undefined
              ? chalk.red(`${item.engagementRate.toFixed(2)}%`)
              : '';
          print(`  ${chalk.dim(item.title ?? item.id)} ${rate}`);
          if (item.platform) {
            print(`    ${chalk.dim(item.platform)}`);
          }
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

performanceCommand
  .command('top')
  .description('Show top performing content')
  .option('-b, --brand <id>', 'Brand ID (overrides active brand)')
  .option('-l, --limit <n>', 'Max items', Number.parseInt, 10)
  .option('--start <iso>', 'Start date')
  .option('--end <iso>', 'End date')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const activeBrandId = await getActiveBrand();
      const brandId = options.brand ?? activeBrandId;

      const spinner = ora('Fetching top performers...').start();
      const data = await getTopPerformers({
        brand: brandId,
        end: options.end,
        limit: options.limit,
        start: options.start,
      });
      spinner.stop();

      if (data.items.length === 0) {
        print(chalk.dim('No performance data available.'));
        return;
      }

      if (options.json) {
        printJson(data);
        return;
      }

      print(formatHeader(`\nTop Performers (${data.items.length}):\n`));

      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const rank = chalk.dim(`${i + 1}.`);
        const rate =
          item.engagementRate !== undefined
            ? chalk.green(`${item.engagementRate.toFixed(2)}%`)
            : '';
        print(`  ${rank} ${chalk.cyan(item.title ?? item.id)} ${rate}`);
        const stats = [
          item.impressions !== undefined ? `${item.impressions} impressions` : null,
          item.likes !== undefined ? `${item.likes} likes` : null,
          item.shares !== undefined ? `${item.shares} shares` : null,
        ]
          .filter(Boolean)
          .join(' | ');
        if (stats) {
          print(`     ${chalk.dim(stats)}`);
        }
        print();
      }
    } catch (error) {
      handleError(error);
    }
  });

performanceCommand
  .command('prompts')
  .description('Show prompt performance analytics')
  .option('-b, --brand <id>', 'Brand ID (overrides active brand)')
  .option('--start <iso>', 'Start date')
  .option('--end <iso>', 'End date')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const activeBrandId = await getActiveBrand();
      const brandId = options.brand ?? activeBrandId;

      const spinner = ora('Fetching prompt performance...').start();
      const data = await getPromptPerformance({
        brand: brandId,
        end: options.end,
        start: options.start,
      });
      spinner.stop();

      if (data.prompts.length === 0) {
        print(chalk.dim('No prompt performance data available.'));
        return;
      }

      if (options.json) {
        printJson(data);
        return;
      }

      print(formatHeader(`\nPrompt Performance (${data.prompts.length}):\n`));

      for (const p of data.prompts) {
        const engagement = chalk.dim(`avg engagement: ${p.averageEngagement.toFixed(2)}%`);
        const uses = chalk.dim(`${p.uses} uses`);
        print(`  ${chalk.cyan(p.prompt.slice(0, 60))}${p.prompt.length > 60 ? '...' : ''}`);
        print(`    ${uses} | ${engagement}`);
        print();
      }
    } catch (error) {
      handleError(error);
    }
  });

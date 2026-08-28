import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client';
import {
  getPromptPerformance,
  getTopPerformers,
  getWeeklySummary,
  type PerformanceContentItem,
} from '@/api/performance';
import { getActiveBrand } from '@/config/store';
import { formatHeader, formatLabel, print, printJson } from '@/ui/theme';
import { handleError, NoBrandError } from '@/utils/errors';
import { parsePositiveInteger } from '@/utils/options';

export const performanceCommand = new Command('performance').description(
  'Content performance analytics'
);

/**
 * The API requires a brand id on every performance endpoint, so resolve it
 * before spending a request that would come back as a 400.
 */
async function requirePerformanceBrand(brand?: string): Promise<string> {
  const brandId = brand ?? (await getActiveBrand());
  if (brandId) return brandId;
  throw new NoBrandError();
}

function formatRate(rate: number): string {
  return `${rate.toFixed(2)}%`;
}

function formatItemStats(item: PerformanceContentItem): string {
  return [
    item.platform || null,
    `${item.views} views`,
    `${item.likes} likes`,
    `${item.shares} shares`,
  ]
    .filter(Boolean)
    .join(' | ');
}

function printItems(items: PerformanceContentItem[], colorRate: (rate: string) => string): void {
  for (const item of items) {
    print(
      `  ${chalk.cyan(item.title || item.postId)} ${colorRate(formatRate(item.engagementRate))}`
    );
    print(`    ${chalk.dim(formatItemStats(item))}`);
  }
}

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

      const brandId = await requirePerformanceBrand(options.brand);

      const spinner = ora('Fetching weekly summary...').start();
      const summary = await getWeeklySummary({
        brandId,
        endDate: options.end,
        startDate: options.start,
        topN: options.top,
        worstN: options.worst,
      });
      spinner.stop();

      if (options.json) {
        printJson(summary);
        return;
      }

      const trend = summary.weekOverWeekTrend;

      print(formatHeader('\nWeekly Performance Summary:\n'));
      print(formatLabel('Trend', `${trend.direction} ${formatRate(trend.percentageChange)}`));
      print(formatLabel('Avg Engagement Rate', formatRate(trend.currentEngagement)));
      print(formatLabel('Previous Week', formatRate(trend.previousEngagement)));

      if (summary.topPerformers.length > 0) {
        print();
        print(formatHeader('Top Performers:\n'));
        printItems(summary.topPerformers, chalk.green);
      }

      if (summary.worstPerformers.length > 0) {
        print();
        print(formatHeader('Needs Improvement:\n'));
        printItems(summary.worstPerformers, chalk.red);
      }

      if (summary.avgEngagementByPlatform.length > 0) {
        print();
        print(formatHeader('Engagement by Platform:\n'));
        for (const platform of summary.avgEngagementByPlatform) {
          print(
            `  ${chalk.cyan(platform.platform)} ${formatRate(platform.avgEngagementRate)} ${chalk.dim(
              `(${platform.totalPosts} posts)`
            )}`
          );
        }
      }

      if (summary.bestPostingTimes.length > 0) {
        print();
        print(formatHeader('Best Posting Times:\n'));
        for (const slot of summary.bestPostingTimes) {
          const hour = `${String(slot.hour).padStart(2, '0')}:00`;
          print(
            `  ${chalk.cyan(hour)} ${formatRate(slot.avgEngagementRate)} ${chalk.dim(
              `(${slot.postCount} posts)`
            )}`
          );
        }
      }

      if (summary.topHooks.length > 0) {
        print();
        print(formatHeader('Top Hooks:\n'));
        for (const hook of summary.topHooks) {
          print(`  ${chalk.dim(hook)}`);
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
  .option('-l, --limit <n>', 'Max items', parsePositiveInteger, 10)
  .option('--start <iso>', 'Start date')
  .option('--end <iso>', 'End date')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const brandId = await requirePerformanceBrand(options.brand);

      const spinner = ora('Fetching top performers...').start();
      const items = await getTopPerformers({
        brandId,
        endDate: options.end,
        limit: options.limit,
        startDate: options.start,
      });
      spinner.stop();

      if (options.json) {
        printJson(items);
        return;
      }

      if (items.length === 0) {
        print(chalk.dim('No performance data available.'));
        return;
      }

      print(formatHeader(`\nTop Performers (${items.length}):\n`));

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rank = chalk.dim(`${i + 1}.`);
        print(
          `  ${rank} ${chalk.cyan(item.title || item.postId)} ${chalk.green(
            formatRate(item.engagementRate)
          )}`
        );
        print(`     ${chalk.dim(formatItemStats(item))}`);
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

      const brandId = await requirePerformanceBrand(options.brand);

      const spinner = ora('Fetching prompt performance...').start();
      const prompts = await getPromptPerformance({
        brandId,
        endDate: options.end,
        startDate: options.start,
      });
      spinner.stop();

      if (options.json) {
        printJson(prompts);
        return;
      }

      if (prompts.length === 0) {
        print(chalk.dim('No prompt performance data available.'));
        return;
      }

      print(formatHeader(`\nPrompt Performance (${prompts.length}):\n`));

      for (const prompt of prompts) {
        const engagement = chalk.dim(`avg engagement: ${formatRate(prompt.avgEngagementRate)}`);
        const posts = chalk.dim(`${prompt.totalPosts} posts`);
        const views = chalk.dim(`${prompt.totalViews} views`);
        print(
          `  ${chalk.cyan(prompt.promptSnippet.slice(0, 60))}${
            prompt.promptSnippet.length > 60 ? '...' : ''
          }`
        );
        print(`    ${posts} | ${views} | ${engagement}`);
        print();
      }
    } catch (error) {
      handleError(error);
    }
  });

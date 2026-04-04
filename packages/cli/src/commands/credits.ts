import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client.js';
import { getCreditSummary, getCreditUsage } from '@/api/credits.js';
import { formatHeader, formatLabel, print, printJson } from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';

export const creditsCommand = new Command('credits').description('View credit usage and billing');

creditsCommand
  .command('usage')
  .description('Show credit usage')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching credit usage...').start();
      const usage = await getCreditUsage();
      spinner.stop();

      if (options.json) {
        printJson(usage);
        return;
      }

      print(formatHeader('\nCredit Usage:\n'));
      if (usage.currentBalance !== undefined) {
        print(formatLabel('Current Balance', String(usage.currentBalance)));
      }
      if (usage.usage7Days !== undefined) {
        print(formatLabel('Used (7d)', String(usage.usage7Days)));
      }
      if (usage.usage30Days !== undefined) {
        print(formatLabel('Used (30d)', String(usage.usage30Days)));
      }
      if (usage.trendPercentage !== undefined) {
        print(formatLabel('Trend', `${usage.trendPercentage.toFixed(2)}%`));
      }
      if (usage.total !== undefined) {
        print(formatLabel('Total', String(usage.total)));
      }
      if (usage.used !== undefined) {
        print(formatLabel('Used', String(usage.used)));
      }
      if (usage.remaining !== undefined) {
        print(formatLabel('Remaining', String(usage.remaining)));
      }
      if (usage.period) {
        print(formatLabel('Period', usage.period));
      }

      if (usage.breakdown && usage.breakdown.length > 0) {
        print();
        print(formatHeader('Breakdown (30d):\n'));
        for (const row of usage.breakdown) {
          print(formatLabel(`${row.source} (${row.count})`, String(row.amount)));
        }
      } else if (usage.byCategory) {
        print();
        print(formatHeader('By Category:\n'));
        for (const [category, amount] of Object.entries(usage.byCategory)) {
          print(formatLabel(category, String(amount)));
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

creditsCommand
  .command('summary')
  .description('Show billing summary')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching billing summary...').start();
      const summary = await getCreditSummary();
      spinner.stop();

      if (options.json) {
        printJson(summary);
        return;
      }

      print(formatHeader('\nBilling Summary:\n'));
      print(formatLabel('Total Usage', String(summary.totalUsage)));
      print(formatLabel('Billable Usage', String(summary.billableUsage)));
      print(formatLabel('Free Remaining', String(summary.freeRemaining)));
      if (summary.projectedFee !== undefined) {
        print(formatLabel('Projected Fee', `$${summary.projectedFee.toFixed(2)}`));
      }
      if (summary.billingPeriod) {
        print(formatLabel('Billing Period', summary.billingPeriod));
      }
      if (summary.resetDate) {
        print(formatLabel('Resets', summary.resetDate));
      }

      print();
      print(chalk.dim('Manage billing at https://app.genfeed.ai/settings/billing'));
    } catch (error) {
      handleError(error);
    }
  });

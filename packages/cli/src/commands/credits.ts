import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client';
import { getCreditSummary, getCreditUsage } from '@/api/credits';
import { getAppUrl } from '@/config/store';
import {
  parseCreditQuantity,
  readCreditBalance,
  readCreditHistory,
  readCreditPacks,
  startCreditsCheckout,
} from '@/operations/credits';
import { formatHeader, formatLabel, print, printJson } from '@/ui/theme';
import { openExternalUrl } from '@/utils/browser';
import { GenfeedError, handleError } from '@/utils/errors';
import { parsePositiveInteger } from '@/utils/options';

interface CreditsBuyOptions {
  json?: boolean;
  open: boolean;
}

async function promptForCredits(): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new GenfeedError(
      'Credit quantity is required in non-interactive mode',
      'Use `gf credits buy <credits>`'
    );
  }

  const packs = readCreditPacks();
  const value = await input({
    default: '5000',
    message: `Credits (${packs.minimumCredits.toLocaleString()}–${packs.maximumCredits.toLocaleString()}):`,
    validate: (candidate) => {
      try {
        parseCreditQuantity(candidate);
        return true;
      } catch (error) {
        return error instanceof Error ? error.message : 'Invalid credit quantity';
      }
    },
  });

  return parseCreditQuantity(value);
}

async function runBalance(json = false): Promise<void> {
  await requireAuth();
  const spinner = json ? undefined : ora('Fetching credit balance...').start();
  const result = await readCreditBalance();
  spinner?.stop();

  if (json) {
    printJson(result);
    return;
  }

  print(formatHeader('Credit Balance\n'));
  print(formatLabel('Available', `${result.balance.toLocaleString()} credits`));
}

export function createCreditsCommand(): Command {
  const creditsCommand = new Command('credits')
    .description('Inspect usage and purchase Genfeed credits')
    .option('--json', 'Output the balance as JSON')
    .action(async (options) => {
      try {
        await runBalance(Boolean(options.json));
      } catch (error) {
        handleError(error);
      }
    });

  creditsCommand
    .command('packs')
    .description('List canonical credit packs and custom purchase bounds')
    .option('--json', 'Output as JSON')
    .action((options) => {
      const result = readCreditPacks();

      if (options.json) {
        printJson(result);
        return;
      }

      print(formatHeader('Credit Packs\n'));
      for (const pack of result.packs) {
        print(formatLabel(pack.label, `${pack.credits.toLocaleString()} credits`));
      }
      print();
      print(
        chalk.dim(
          `Custom purchases: ${result.minimumCredits.toLocaleString()}–${result.maximumCredits.toLocaleString()} credits`
        )
      );
    });

  creditsCommand
    .command('buy')
    .description('Open hosted Checkout for Genfeed credits')
    .argument('[credits]', 'Whole credits to purchase', parseCreditQuantity)
    .option('--no-open', 'Print the Checkout URL without opening a browser')
    .option('--json', 'Output as JSON')
    .action(async (credits: number | undefined, options: CreditsBuyOptions) => {
      try {
        await requireAuth();
        const quantity = credits ?? (await promptForCredits());
        const spinner = options.json ? undefined : ora('Creating secure Checkout...').start();
        const checkout = await startCreditsCheckout(quantity);
        const opened = options.open ? await openExternalUrl(checkout.url) : false;
        spinner?.succeed(opened ? 'Checkout opened' : 'Checkout ready');

        if (options.json) {
          printJson({ credits: quantity, opened, url: checkout.url });
          return;
        }

        print(formatLabel('Credits', quantity.toLocaleString()));
        print(formatLabel('Checkout', checkout.url));
        if (!opened) {
          print(chalk.dim('Open the URL in a browser to complete payment.'));
        }
        print(chalk.dim('Credits are added after Stripe confirms payment.'));
      } catch (error) {
        handleError(error);
      }
    });

  creditsCommand
    .command('history')
    .description('Show credit ledger history')
    .option('-l, --limit <n>', 'Maximum rows', parsePositiveInteger, 50)
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        await requireAuth();
        const spinner = options.json ? undefined : ora('Fetching credit history...').start();
        const transactions = await readCreditHistory(options.limit);
        spinner?.stop();

        if (options.json) {
          printJson(transactions);
          return;
        }

        if (transactions.length === 0) {
          print(chalk.dim('No credit transactions found.'));
          return;
        }

        print(formatHeader('Credit History\n'));
        for (const transaction of transactions) {
          const signedAmount =
            transaction.amount > 0 ? `+${transaction.amount}` : transaction.amount;
          print(
            `${chalk.cyan(String(signedAmount))}  ${transaction.description ?? transaction.source ?? transaction.category}`
          );
          print(
            chalk.dim(
              `  ${transaction.createdAt} · balance ${transaction.balanceAfter.toLocaleString()}`
            )
          );
        }
      } catch (error) {
        handleError(error);
      }
    });

  creditsCommand
    .command('usage')
    .description('Show credit usage')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        await requireAuth();

        const spinner = options.json ? undefined : ora('Fetching credit usage...').start();
        const usage = await getCreditUsage();
        spinner?.stop();

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
        if (usage.breakdown?.length) {
          print();
          print(formatHeader('Breakdown (30d):\n'));
          for (const row of usage.breakdown) {
            print(formatLabel(`${row.source} (${row.count})`, String(row.amount)));
          }
        }
      } catch (error) {
        handleError(error);
      }
    });

  creditsCommand
    .command('summary')
    .description('Show BYOK billing summary')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        await requireAuth();

        const spinner = options.json ? undefined : ora('Fetching billing summary...').start();
        const summary = await getCreditSummary();
        spinner?.stop();

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
        print();
        print(chalk.dim(`Manage billing at ${await getAppUrl()}/settings/credits`));
      } catch (error) {
        handleError(error);
      }
    });

  return creditsCommand;
}

export const creditsCommand = createCreditsCommand();

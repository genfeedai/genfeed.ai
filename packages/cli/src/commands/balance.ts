import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client';
import { readCreditBalance } from '@/operations/credits';
import { formatHeader, formatLabel, print, printJson } from '@/ui/theme';
import { handleError } from '@/utils/errors';

export const balanceCommand = new Command('balance')
  .description('Show the active organization credit balance')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();
      const spinner = options.json ? undefined : ora('Fetching credit balance...').start();
      const result = await readCreditBalance();
      spinner?.stop();

      if (options.json) {
        printJson(result);
        return;
      }

      print(formatHeader('Credit Balance\n'));
      print(formatLabel('Available', `${result.balance.toLocaleString()} credits`));
    } catch (error) {
      handleError(error);
    }
  });

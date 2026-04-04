import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { get, requireAuth } from '@/api/client.js';
import { flattenCollection, type JsonApiCollectionResponse } from '@/api/json-api.js';
import { getOrganizationId } from '@/config/store.js';
import { formatHeader, print, printJson } from '@/ui/theme.js';
import { GenfeedError, handleError } from '@/utils/errors.js';

interface Ingredient {
  id: string;
  category: string;
  status: string;
  text?: string;
  model?: string;
}

export const libraryCommand = new Command('library')
  .description('Browse content library')
  .option('-t, --type <type>', 'Filter by type (image, video, music, avatar)')
  .option('-l, --limit <limit>', 'Max items to show', '20')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const orgId = await getOrganizationId();
      if (!orgId) {
        throw new GenfeedError(
          'No organization found',
          'Re-authenticate with `gf login` to link your organization'
        );
      }

      const spinner = ora('Fetching library...').start();

      try {
        const params = new URLSearchParams();
        if (options.type) params.set('category', options.type);
        params.set('limit', options.limit);

        const response = await get<JsonApiCollectionResponse>(
          `/organizations/${orgId}/ingredients?${params.toString()}`
        );
        const items = flattenCollection<Ingredient>(response);
        spinner.stop();

        if (items.length === 0) {
          print(chalk.dim('No items found.'));
          return;
        }

        if (options.json) {
          printJson(items);
          return;
        }

        print(formatHeader(`\nLibrary (${items.length} items):\n`));

        for (const item of items) {
          const category = chalk.blue(`[${item.category}]`);
          const status =
            item.status === 'generated' ? chalk.green(item.status) : chalk.dim(item.status);
          const id = chalk.dim(`(${item.id})`);

          print(`  ${category} ${status} ${id}`);
          if (item.text) {
            print(`  ${chalk.dim(item.text.slice(0, 80))}...`);
          }
          print();
        }
      } catch (error) {
        spinner.fail('Failed to fetch library');
        throw error;
      }
    } catch (error) {
      handleError(error);
    }
  });

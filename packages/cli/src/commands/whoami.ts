import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { whoami } from '@/api/auth.js';
import { getBrand } from '@/api/brands.js';
import { requireAuth } from '@/api/client.js';
import { getActiveBrand } from '@/config/store.js';
import { formatLabel, formatSuccess, print, printJson } from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';

export const whoamiCommand = new Command('whoami')
  .description('Show current user and organization')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching user info...').start();
      const info = await whoami();
      spinner.stop();

      const activeBrandId = await getActiveBrand();
      let activeBrand = null;
      if (activeBrandId) {
        try {
          activeBrand = await getBrand(activeBrandId);
        } catch {
          // Brand may have been deleted
        }
      }

      if (options.json) {
        printJson({
          activeBrand: activeBrand ? { id: activeBrand.id, label: activeBrand.label } : null,
          organization: info.organization,
          scopes: info.scopes,
          user: info.user,
        });
        return;
      }

      print(formatSuccess(`Logged in as ${chalk.bold(info.user.name)}`));
      print();
      print(formatLabel('Email', info.user.email));
      print(formatLabel('Organization', info.organization.name));
      print(formatLabel('Scopes', info.scopes.join(', ')));
      if (activeBrand) {
        print(formatLabel('Active Brand', activeBrand.label));
      } else if (activeBrandId) {
        print(formatLabel('Active Brand', chalk.dim('(not found - run gf brands select)')));
      } else {
        print(formatLabel('Active Brand', chalk.dim('(none - run gf brands select)')));
      }
    } catch (error) {
      handleError(error);
    }
  });

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client.js';
import { listMyOrganizations, switchOrganization } from '@/api/organizations.js';
import { setActiveBrand, setOrganizationId } from '@/config/store.js';
import {
  formatHeader,
  formatLabel,
  formatSuccess,
  formatWarning,
  print,
  printJson,
} from '@/ui/theme.js';
import { GenfeedError, handleError } from '@/utils/errors.js';

export const organizationsCommand = new Command('organizations')
  .description('Manage organizations')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching organizations...').start();
      const organizations = await listMyOrganizations();
      spinner.stop();

      if (options.json) {
        printJson(organizations);
        return;
      }

      if (organizations.length === 0) {
        print(formatWarning('No organizations found.'));
        return;
      }

      print(formatHeader('Your organizations:\n'));
      for (const org of organizations) {
        const isActive = org.isActive;
        const marker = isActive ? chalk.green('●') : chalk.dim('○');
        const name = isActive ? chalk.bold(org.label) : org.label;
        const activeLabel = isActive ? chalk.dim(' (active)') : '';

        print(`  ${marker} ${name}${activeLabel}`);
        if (org.brand?.label) {
          print(`    ${chalk.dim(`Default brand: ${org.brand.label}`)}`);
        }
      }

      print();
      print(chalk.dim('Run `gf organizations select` to switch organization'));
    } catch (error) {
      handleError(error);
    }
  });

organizationsCommand
  .command('select')
  .description('Select the active organization')
  .action(async () => {
    try {
      await requireAuth();

      const spinner = ora('Fetching organizations...').start();
      const organizations = await listMyOrganizations();
      spinner.stop();

      if (organizations.length === 0) {
        throw new GenfeedError('No organizations found', 'Create one at https://app.genfeed.ai');
      }

      const active = organizations.find((org) => org.isActive);
      const selected = await select({
        choices: organizations.map((org) => ({
          description: org.brand?.label
            ? `Default brand: ${org.brand.label}`
            : 'No default brand in this organization',
          name: org.isActive ? `${org.label} (current)` : org.label,
          value: org.id,
        })),
        default: active?.id,
        message: 'Select an organization:',
      });

      const switchSpinner = ora('Switching organization...').start();
      const result = await switchOrganization(selected);
      switchSpinner.stop();

      await setOrganizationId(result.organization.id);
      await setActiveBrand(result.brand.id);

      print();
      print(
        formatSuccess(
          `Active organization: ${chalk.bold(result.organization.label)} · brand: ${chalk.bold(
            result.brand.label
          )}`
        )
      );
    } catch (error) {
      handleError(error);
    }
  });

organizationsCommand
  .command('current')
  .description('Show current active organization')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching current organization...').start();
      const organizations = await listMyOrganizations();
      spinner.stop();

      const active = organizations.find((org) => org.isActive) ?? null;
      if (options.json) {
        printJson({ activeOrganization: active });
        return;
      }

      if (!active) {
        print(formatWarning('No active organization found'));
        print(chalk.dim('Run `gf organizations select` to choose one'));
        return;
      }

      print(formatSuccess(`Active organization: ${chalk.bold(active.label)}`));
      if (active.brand?.label) {
        print(formatLabel('Default Brand', active.brand.label));
      }
    } catch (error) {
      handleError(error);
    }
  });

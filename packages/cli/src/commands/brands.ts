import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { getBrand, listBrands } from '@/api/brands.js';
import { requireAuth } from '@/api/client.js';
import { getActiveBrand, getOrganizationId, setActiveBrand } from '@/config/store.js';
import {
  formatHeader,
  formatLabel,
  formatSuccess,
  formatWarning,
  print,
  printJson,
} from '@/ui/theme.js';
import { GenfeedError, handleError } from '@/utils/errors.js';

export const brandsCommand = new Command('brands')
  .description('Manage brands')
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

      const spinner = ora('Fetching brands...').start();
      const brands = await listBrands(orgId);
      spinner.stop();

      const activeBrandId = await getActiveBrand();

      if (options.json) {
        printJson({
          activeBrandId,
          brands: brands.map((b) => ({
            active: b.id === activeBrandId,
            description: b.description,
            id: b.id,
            label: b.label,
          })),
        });
        return;
      }

      if (brands.length === 0) {
        print(formatWarning('No brands found.'));
        print(chalk.dim('Create one at https://app.genfeed.ai'));
        return;
      }

      print(formatHeader('Your brands:\n'));

      for (const brand of brands) {
        const isActive = brand.id === activeBrandId;
        const marker = isActive ? chalk.green('●') : chalk.dim('○');
        const name = isActive ? chalk.bold(brand.label) : brand.label;
        const activeLabel = isActive ? chalk.dim(' (active)') : '';

        print(`  ${marker} ${name}${activeLabel}`);
        if (brand.description) {
          print(`    ${chalk.dim(brand.description)}`);
        }
      }

      print();
      print(chalk.dim('Run `gf brands select` to change the active brand'));
    } catch (error) {
      handleError(error);
    }
  });

brandsCommand
  .command('select')
  .description('Select the active brand')
  .action(async () => {
    try {
      await requireAuth();

      const orgId = await getOrganizationId();
      if (!orgId) {
        throw new GenfeedError(
          'No organization found',
          'Re-authenticate with `gf login` to link your organization'
        );
      }

      const spinner = ora('Fetching brands...').start();
      const brands = await listBrands(orgId);
      spinner.stop();

      if (brands.length === 0) {
        throw new GenfeedError('No brands found', 'Create a brand at https://app.genfeed.ai');
      }

      const activeBrandId = await getActiveBrand();

      const selected = await select({
        choices: brands.map((brand) => ({
          description: brand.description,
          name: brand.id === activeBrandId ? `${brand.label} (current)` : brand.label,
          value: brand.id,
        })),
        default: activeBrandId,
        message: 'Select a brand:',
      });

      await setActiveBrand(selected);
      const selectedBrand = brands.find((b) => b.id === selected);

      print();
      print(formatSuccess(`Active brand: ${chalk.bold(selectedBrand?.label)}`));
    } catch (error) {
      handleError(error);
    }
  });

brandsCommand
  .command('current')
  .description('Show the current active brand')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const activeBrandId = await getActiveBrand();

      if (!activeBrandId) {
        if (options.json) {
          printJson({ activeBrand: null });
          return;
        }
        print(formatWarning('No active brand selected'));
        print(chalk.dim('Run `gf brands select` to choose a brand'));
        return;
      }

      const spinner = ora('Fetching brand...').start();
      const brand = await getBrand(activeBrandId);
      spinner.stop();

      if (options.json) {
        printJson({
          activeBrand: {
            description: brand.description,
            id: brand.id,
            name: brand.label,
          },
        });
        return;
      }

      print(formatSuccess(`Active brand: ${chalk.bold(brand.label)}`));
      if (brand.description) {
        print(formatLabel('Description', brand.description));
      }
    } catch (error) {
      handleError(error);
    }
  });

brandsCommand
  .command('show')
  .description('Show full brand details')
  .argument('<id>', 'Brand ID')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching brand...').start();
      const brand = await getBrand(id);
      spinner.stop();

      if (options.json) {
        printJson(brand);
        return;
      }

      print(formatHeader('\nBrand Details:\n'));
      print(formatLabel('ID', brand.id));
      print(formatLabel('Label', brand.label));
      if (brand.handle) {
        print(formatLabel('Handle', brand.handle));
      }
      if (brand.description) {
        print(formatLabel('Description', brand.description));
      }
      print(formatLabel('Created', brand.createdAt));
      print(formatLabel('Updated', brand.updatedAt));
    } catch (error) {
      handleError(error);
    }
  });

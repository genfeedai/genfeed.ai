import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { type Brand, getBrand } from '@/api/brands';
import { requireAuth } from '@/api/client';
import { getActiveBrand, getAppUrl, setActiveBrand } from '@/config/store';
import { activateBrand, readBrands } from '@/operations/brands';
import {
  formatHeader,
  formatLabel,
  formatSuccess,
  formatWarning,
  print,
  printJson,
} from '@/ui/theme';
import { GenfeedError, handleError } from '@/utils/errors';
import { wantsJson } from '@/utils/options';

type BrandListItem = Pick<Brand, 'description' | 'id' | 'label' | 'slug'> & {
  active: boolean;
};

interface BrandListResult {
  activeBrandId?: string;
  brands: BrandListItem[];
}

async function loadBrandList(): Promise<BrandListResult> {
  const [brands, activeBrandId] = await Promise.all([readBrands(), getActiveBrand()]);
  return {
    activeBrandId,
    brands: brands.map((brand) => ({
      active: brand.id === activeBrandId,
      description: brand.description,
      id: brand.id,
      label: brand.label,
      slug: brand.slug,
    })),
  };
}

function printBrandList(result: BrandListResult): void {
  if (result.brands.length === 0) {
    print(formatWarning('No brands found.'));
    return;
  }

  print(formatHeader('Brands\n'));
  for (const brand of result.brands) {
    const marker = brand.active ? chalk.green('●') : chalk.dim('○');
    const label = brand.active ? chalk.bold(brand.label) : brand.label;
    const slug = brand.slug ? chalk.dim(` (${brand.slug})`) : '';
    print(`  ${marker} ${label}${slug}`);
    print(`    ${chalk.dim(brand.id)}`);
    if (brand.description) {
      print(`    ${chalk.dim(brand.description)}`);
    }
  }
}

async function runBrandList(json = false): Promise<void> {
  await requireAuth();
  const spinner = json ? undefined : ora('Fetching brands...').start();
  const result = await loadBrandList();
  spinner?.stop();

  if (json) {
    printJson(result);
    return;
  }

  printBrandList(result);
}

export const brandsCommand = new Command('brand')
  .alias('brands')
  .description('Inspect and select the active brand')
  .option('--json', 'Output the brand list as JSON')
  .action(async (_options, command: Command) => {
    try {
      await runBrandList(wantsJson(command));
    } catch (error) {
      handleError(error);
    }
  });

brandsCommand
  .command('list')
  .description('List brands in the active organization')
  .option('--json', 'Output as JSON')
  .action(async (_options, command: Command) => {
    try {
      await runBrandList(wantsJson(command));
    } catch (error) {
      handleError(error);
    }
  });

brandsCommand
  .command('use')
  .alias('select')
  .description('Select the active brand by id, slug, or unique label')
  .argument('[reference]', 'Brand id, slug, or unique label')
  .option('--json', 'Output as JSON')
  .action(async (reference: string | undefined, _options, command: Command) => {
    try {
      await requireAuth();
      let selected: Brand;

      if (reference) {
        selected = await activateBrand(reference);
      } else {
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
          throw new GenfeedError(
            'Brand reference is required in non-interactive mode',
            'Use `gf brand use <id-or-slug>`'
          );
        }

        const brands = await readBrands();
        if (brands.length === 0) {
          throw new GenfeedError('No brands found', `Create a brand at ${await getAppUrl()}`);
        }

        const activeBrandId = await getActiveBrand();
        const selectedId = await select({
          choices: brands.map((brand) => ({
            description: brand.description,
            name: brand.id === activeBrandId ? `${brand.label} (current)` : brand.label,
            value: brand.id,
          })),
          default: activeBrandId,
          message: 'Select a brand:',
        });
        selected = brands.find((brand) => brand.id === selectedId)!;
        await setActiveBrand(selected.id);
      }

      if (wantsJson(command)) {
        printJson(selected);
        return;
      }

      print(formatSuccess(`Active brand: ${chalk.bold(selected.label)}`));
    } catch (error) {
      handleError(error);
    }
  });

brandsCommand
  .command('current')
  .description('Show the current active brand')
  .option('--json', 'Output as JSON')
  .action(async (_options, command: Command) => {
    try {
      await requireAuth();
      const activeBrandId = await getActiveBrand();

      if (!activeBrandId) {
        if (wantsJson(command)) {
          printJson({ activeBrand: null });
          return;
        }
        print(formatWarning('No active brand selected'));
        print(chalk.dim('Run `gf brand use` to choose a brand'));
        return;
      }

      const brand = await getBrand(activeBrandId);
      if (wantsJson(command)) {
        printJson({ activeBrand: brand });
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
  .action(async (id, _options, command: Command) => {
    try {
      await requireAuth();
      const brand = await getBrand(id);

      if (wantsJson(command)) {
        printJson(brand);
        return;
      }

      print(formatHeader('Brand Details\n'));
      print(formatLabel('ID', brand.id));
      print(formatLabel('Label', brand.label));
      if (brand.slug) print(formatLabel('Slug', brand.slug));
      if (brand.description) print(formatLabel('Description', brand.description));
      print(formatLabel('Created', brand.createdAt));
      print(formatLabel('Updated', brand.updatedAt));
    } catch (error) {
      handleError(error);
    }
  });

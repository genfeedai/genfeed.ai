import { Command } from 'commander';
import { scanOrganizationBrand } from '@/operations/admin';
import { formatHeader, formatLabel, formatWarning, print, printJson } from '@/ui/theme';
import { handleError } from '@/utils/errors';
import { wantsJson } from '@/utils/options';

interface OrganizationBrandScanOptions {
  brand: string;
  org: string;
  url: string;
  yes?: boolean;
}

export function createBrandScanCommand(): Command {
  return new Command('scan')
    .description('Scan a website or social profile into the brand kit (preview unless --yes)')
    .requiredOption('--org <organizationId>', 'Organization id')
    .requiredOption('--brand <brandId>', 'Brand id')
    .requiredOption('--url <url>', 'Website or social profile URL to scan')
    .option('--yes', 'Run the scan')
    .option('--json', 'Output as JSON')
    .action(async (options: OrganizationBrandScanOptions, command: Command) => {
      try {
        if (!options.yes) {
          print(formatHeader('Brand scan (preview)\n'));
          print(formatLabel('Organization', options.org));
          print(formatLabel('Brand', options.brand));
          print(formatLabel('URL', options.url));
          print(formatWarning('Re-run with --yes to scan and overwrite scraped brand fields.'));
          return;
        }
        const scan = await scanOrganizationBrand(options.org, options.brand, options.url);
        if (wantsJson(command)) {
          printJson(scan);
          return;
        }
        print(formatLabel('Status', scan.scrapeStatus));
        if (scan.scrapeReason) print(formatLabel('Reason', scan.scrapeReason));
      } catch (error) {
        handleError(error);
      }
    });
}

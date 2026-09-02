import { IngredientStatus } from '@genfeedai/contracts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client';
import { downloadGeneratedFile } from '@/commands/generate/helpers';
import { readAsset, readAssets } from '@/operations/assets';
import { formatHeader, formatLabel, print, printJson } from '@/ui/theme';
import { GenfeedError, handleError } from '@/utils/errors';
import { getCommandOptions, parsePositiveInteger, wantsJson } from '@/utils/options';

interface AssetListOptions extends Record<string, unknown> {
  json?: boolean;
  limit: number;
  type?: string;
}

interface AssetShowOptions {
  json?: boolean;
}

interface AssetDownloadOptions {
  output: string;
}

async function runAssetList(options: AssetListOptions): Promise<void> {
  await requireAuth();
  const spinner = options.json ? undefined : ora('Fetching assets...').start();
  try {
    const assets = await readAssets({
      category: options.type,
      limit: options.limit,
    });
    spinner?.stop();
    if (options.json) return printJson(assets);
    if (assets.length === 0) return print(chalk.dim('No assets found.'));

    print(formatHeader(`\nAssets (${assets.length}):\n`));
    for (const asset of assets) {
      const status =
        asset.status === IngredientStatus.GENERATED
          ? chalk.green(asset.status)
          : chalk.dim(asset.status);
      print(`  ${chalk.blue(`[${asset.category}]`)} ${status} ${chalk.dim(`(${asset.id})`)}`);
      if (asset.text) print(`  ${chalk.dim(asset.text.slice(0, 80))}`);
      if (asset.cdnUrl) print(`  ${chalk.dim(asset.cdnUrl)}`);
      print();
    }
  } catch (error) {
    spinner?.fail('Failed to fetch assets');
    throw error;
  }
}

function addListOptions(command: Command): Command {
  return command
    .option('-t, --type <type>', 'Filter by type (image, video, music, avatar)')
    .option('-l, --limit <limit>', 'Max items to show', parsePositiveInteger, 20)
    .option('--json', 'Output as JSON');
}

export const libraryCommand = addListOptions(
  new Command('asset').alias('library').description('Browse and download content assets')
).action(async (options: AssetListOptions) => {
  try {
    await runAssetList(options);
  } catch (error) {
    handleError(error);
  }
});

libraryCommand.addCommand(
  addListOptions(new Command('list').description('List content assets')).action(
    async (_options: AssetListOptions, command: Command) => {
      try {
        await runAssetList(getCommandOptions<AssetListOptions>(command));
      } catch (error) {
        handleError(error);
      }
    }
  )
);

libraryCommand.addCommand(
  new Command('show')
    .description('Show one content asset')
    .argument('<id>', 'Asset ID')
    .option('--json', 'Output as JSON')
    .action(async (id: string, _options: AssetShowOptions, command: Command) => {
      try {
        await requireAuth();
        const asset = await readAsset(id);
        if (wantsJson(command)) return printJson(asset);
        print(formatHeader('Asset\n'));
        print(formatLabel('ID', asset.id));
        print(formatLabel('Type', asset.category));
        print(formatLabel('Status', asset.status));
        if (asset.cdnUrl) print(formatLabel('URL', asset.cdnUrl));
        if (asset.model) print(formatLabel('Model', asset.model));
        if (asset.text) print(formatLabel('Prompt', asset.text));
      } catch (error) {
        handleError(error);
      }
    })
);

libraryCommand.addCommand(
  new Command('download')
    .description('Download a generated asset')
    .argument('<id>', 'Asset ID')
    .requiredOption('-o, --output <path>', 'Destination path')
    .action(async (id: string, options: AssetDownloadOptions) => {
      try {
        await requireAuth();
        const asset = await readAsset(id);
        if (!asset.cdnUrl) {
          throw new GenfeedError(`Asset ${id} is not downloadable yet`);
        }
        await downloadGeneratedFile('asset', options.output, asset.cdnUrl);
      } catch (error) {
        handleError(error);
      }
    })
);

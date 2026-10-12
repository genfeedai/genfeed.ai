import os from 'node:os';
import { password } from '@inquirer/prompts';
import { Command } from 'commander';
import {
  formatHeader,
  formatLabel,
  formatSuccess,
  formatWarning,
  print,
  printJson,
} from '@/ui/theme';
import { GenfeedError, handleError } from '@/utils/errors';
import cliPackage from '../../../package.json';
import { findProvider, isApiProvider, PROVIDER_CATALOG } from './catalog';
import { emptyHostConfig, readHostConfig, resolveHostPaths, writeHostConfig } from './config';
import { detectProviders } from './detect';
import {
  type BrowserId,
  installHost,
  readInstalledManifests,
  resolveLauncherTarget,
  SUPPORTED_BROWSERS,
  toHostPlatform,
  uninstallHost,
} from './install';
import { runHost } from './server';

function parseBrowsers(values: string[] | undefined): BrowserId[] | null {
  if (!values || values.length === 0) return null;
  const invalid = values.filter(
    (value) => !(SUPPORTED_BROWSERS as readonly string[]).includes(value)
  );
  if (invalid.length > 0) {
    throw new GenfeedError(
      `Unknown browser: ${invalid.join(', ')}`,
      `Use ${SUPPORTED_BROWSERS.join(', ')}`
    );
  }
  return values as BrowserId[];
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').trim();
}

const installCommand = new Command('install')
  .description('Register the Genfeed native host with Chrome, Chromium, Brave and Edge')
  .option('-b, --browser <browser...>', 'Only these browsers (chrome, chromium, brave, edge)')
  .option(
    '--extension-id <id...>',
    'Also allow this extension ID, for example a Chrome Web Store build'
  )
  .action(async (options: { browser?: string[]; extensionId?: string[] }) => {
    try {
      const homeDirectory = os.homedir();
      const report = await installHost({
        browsers: parseBrowsers(options.browser),
        extraExtensionIds: options.extensionId ?? [],
        homeDirectory,
        paths: resolveHostPaths(homeDirectory),
        pathValue: process.env.PATH ?? '',
        platform: toHostPlatform(process.platform),
        target: resolveLauncherTarget(process.execPath, process.argv[1]),
      });
      print(formatSuccess('Genfeed native host registered'));
      for (const manifest of report.manifests) {
        print(formatLabel(manifest.browser, manifest.path));
      }
      print(formatLabel('Launcher', report.launcherPath));
      print(formatLabel('Allowed extensions', report.allowedOrigins.join(', ')));
      if (report.skippedBrowsers.length > 0) {
        print(formatWarning(`No profile found for: ${report.skippedBrowsers.join(', ')}`));
      }
      print();
      print('Reload the extension, then choose a local fallback provider in its Settings.');
    } catch (error) {
      handleError(error);
    }
  });

const uninstallCommand = new Command('uninstall')
  .description('Remove the native host registration and launcher')
  .option('--purge', 'Also delete the host config, including saved API keys')
  .action(async (options: { purge?: boolean }) => {
    try {
      const homeDirectory = os.homedir();
      const { removed } = await uninstallHost({
        homeDirectory,
        paths: resolveHostPaths(homeDirectory),
        platform: toHostPlatform(process.platform),
        shouldPurge: options.purge === true,
      });
      print(
        formatSuccess(removed.length > 0 ? 'Removed the native host' : 'Nothing was installed')
      );
      for (const file of removed) print(formatLabel('Removed', file));
    } catch (error) {
      handleError(error);
    }
  });

const statusCommand = new Command('status')
  .description('Show where the host is registered and which providers it detects (nothing is run)')
  .option('--json', 'Output as JSON')
  .action(async (options: { json?: boolean }) => {
    try {
      const homeDirectory = os.homedir();
      const paths = resolveHostPaths(homeDirectory);
      const platform = toHostPlatform(process.platform);
      const manifests = await readInstalledManifests(platform, homeDirectory);
      const config = await readHostConfig(paths).catch(() => emptyHostConfig());
      const providers = await detectProviders(
        { homeDirectory, pathValue: process.env.PATH },
        config
      );
      if (options.json) {
        printJson({ allowedOrigins: config.allowedOrigins, manifests, providers });
        return;
      }
      print(formatHeader('Native host'));
      if (manifests.length === 0) print(formatWarning('Not installed. Run `gf host install`.'));
      for (const manifest of manifests) {
        print(
          formatLabel(
            manifest.browser,
            `${manifest.path}${manifest.isLauncherExecutable ? '' : ' (launcher missing)'}`
          )
        );
      }
      print(formatLabel('Allowed extensions', config.allowedOrigins.join(', ') || '(none)'));
      print();
      print(formatHeader('Providers'));
      for (const provider of providers) {
        print(formatLabel(provider.label, provider.isAvailable ? 'available' : 'not found'));
      }
    } catch (error) {
      handleError(error);
    }
  });

const providerAddCommand = new Command('add')
  .description('Save a bring-your-own-key provider; the key stays in the host config')
  .argument('<provider>', 'openai-api, anthropic-api or gemini-api')
  .requiredOption('-m, --model <model>', 'Model the provider should use')
  .option('--key-stdin', 'Read the API key from stdin instead of prompting')
  .action(async (providerId: string, options: { keyStdin?: boolean; model: string }) => {
    try {
      const provider = PROVIDER_CATALOG.find((candidate) => candidate.id === providerId);
      if (!provider || !isApiProvider(provider)) {
        throw new GenfeedError(
          `Unknown API provider: ${providerId}`,
          'Use openai-api, anthropic-api or gemini-api'
        );
      }
      const apiKey = options.keyStdin
        ? await readStdin()
        : await password({ mask: '*', message: `${provider.label}:` });
      if (!apiKey) throw new GenfeedError('No API key was given');
      const paths = resolveHostPaths();
      const config = await readHostConfig(paths).catch(() => emptyHostConfig());
      await writeHostConfig(paths, {
        ...config,
        providers: { ...config.providers, [provider.id]: { apiKey, model: options.model } },
      });
      print(formatSuccess(`Saved ${provider.label} (${options.model})`));
    } catch (error) {
      handleError(error);
    }
  });

const providerRemoveCommand = new Command('remove')
  .description('Delete a saved bring-your-own-key provider')
  .argument('<provider>', 'openai-api, anthropic-api or gemini-api')
  .action(async (providerId: string) => {
    try {
      const provider = PROVIDER_CATALOG.find((candidate) => candidate.id === providerId);
      if (!provider || !isApiProvider(provider)) {
        throw new GenfeedError(`Unknown API provider: ${providerId}`);
      }
      const paths = resolveHostPaths();
      const config = await readHostConfig(paths).catch(() => emptyHostConfig());
      const { [provider.id]: removed, ...providers } = config.providers;
      await writeHostConfig(paths, { ...config, providers });
      print(
        removed
          ? formatSuccess(`Removed ${findProvider(provider.id).label}`)
          : formatWarning(`${provider.label} was not saved`)
      );
    } catch (error) {
      handleError(error);
    }
  });

const providerCommand = new Command('provider')
  .description('Manage bring-your-own-key providers for the native host')
  .addCommand(providerAddCommand)
  .addCommand(providerRemoveCommand);

/**
 * What the browser starts (through the launcher). It speaks native messaging on
 * stdio, so it must print nothing else to stdout.
 */
const serveCommand = new Command('serve')
  .description('Run as the browser-launched native host (speaks native messaging on stdio)')
  .argument('[origin]', 'Extension origin passed by the browser')
  .allowExcessArguments()
  .action(async (origin: string | undefined) => {
    const homeDirectory = os.homedir();
    await runHost({
      env: process.env,
      fetchImpl: fetch,
      homeDirectory,
      hostVersion: cliPackage.version,
      origin,
      paths: resolveHostPaths(homeDirectory),
      stderr: process.stderr,
      stdin: process.stdin,
      stdout: process.stdout,
    });
  });

export const hostCommand = new Command('host')
  .description('Bridge local AI CLIs and API keys to the Genfeed browser extension')
  .addCommand(installCommand)
  .addCommand(uninstallCommand)
  .addCommand(statusCommand)
  .addCommand(providerCommand)
  .addCommand(serveCommand, { hidden: true });

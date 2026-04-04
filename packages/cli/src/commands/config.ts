import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import { defaultProfile, type Profile } from '@/config/schema.js';
import {
  getActiveProfile,
  getConfigPath,
  loadConfig,
  saveConfig,
  setAgentModel,
  setProfileField,
} from '@/config/store.js';
import { formatHeader, formatLabel, formatSuccess, print, printJson } from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';

const SETTABLE_KEYS: Record<string, keyof Profile> = {
  'agent-model': 'agent',
  'api-key': 'apiKey',
  'api-url': 'apiUrl',
  brand: 'activeBrand',
  'darkroom-host': 'darkroomHost',
  'darkroom-port': 'darkroomApiPort',
  'org-id': 'organizationId',
  persona: 'activePersona',
  role: 'role',
};

export const configCommand = new Command('config').description('Manage CLI configuration');

configCommand
  .command('show')
  .description('Show full resolved configuration for the active profile')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const { name, profile } = await getActiveProfile();

      if (options.json) {
        printJson({ profile: name, ...profile });
        return;
      }

      print(formatHeader(`\nConfiguration (profile: ${name}):\n`));
      print(formatLabel('API URL', profile.apiUrl));
      print(
        formatLabel('API Key', profile.apiKey ? `${profile.apiKey.slice(0, 12)}...` : 'not set')
      );
      print(formatLabel('Organization', profile.organizationId ?? 'not set'));
      print(formatLabel('Active Brand', profile.activeBrand ?? 'not set'));
      print(formatLabel('Active Persona', profile.activePersona ?? 'not set'));
      print(formatLabel('Agent Model', profile.agent.model ?? 'server default'));
      print(formatLabel('Role', profile.role));
      print(formatLabel('Image Model', profile.defaults.imageModel));
      print(formatLabel('Video Model', profile.defaults.videoModel));
      print(formatLabel('Darkroom Host', profile.darkroomHost));
      print(formatLabel('Darkroom Port', String(profile.darkroomApiPort)));
    } catch (error) {
      handleError(error);
    }
  });

configCommand
  .command('path')
  .description('Show config file path')
  .action(() => {
    print(getConfigPath());
  });

configCommand
  .command('set')
  .description('Set a config value')
  .argument('<key>', `Config key (${Object.keys(SETTABLE_KEYS).join(', ')})`)
  .argument('<value>', 'Value to set')
  .action(async (key, value) => {
    try {
      const profileKey = SETTABLE_KEYS[key];
      if (!profileKey) {
        print(chalk.red(`Unknown config key: ${key}`));
        print(chalk.dim(`Valid keys: ${Object.keys(SETTABLE_KEYS).join(', ')}`));
        process.exit(1);
      }

      let coerced: Profile[typeof profileKey] | string | number = value;
      if (profileKey === 'darkroomApiPort') {
        coerced = Number.parseInt(value, 10);
        if (Number.isNaN(coerced)) {
          print(chalk.red('Port must be a number'));
          process.exit(1);
        }
      }

      if (profileKey === 'agent') {
        await setAgentModel(value);
      } else {
        await setProfileField(profileKey, coerced as Profile[typeof profileKey]);
      }
      print(formatSuccess(`Set ${key} = ${value}`));
    } catch (error) {
      handleError(error);
    }
  });

configCommand
  .command('reset')
  .description('Reset active profile to defaults')
  .option('--force', 'Skip confirmation prompt')
  .action(async (options) => {
    try {
      if (!options.force) {
        const confirmed = await confirm({
          default: false,
          message: 'Reset active profile to defaults? This will clear your API key and settings.',
        });
        if (!confirmed) {
          print(chalk.dim('Cancelled.'));
          return;
        }
      }

      const config = await loadConfig();
      const name = config.activeProfile;
      config.profiles[name] = { ...defaultProfile };
      await saveConfig(config);

      print(formatSuccess(`Profile "${name}" reset to defaults`));
    } catch (error) {
      handleError(error);
    }
  });

import chalk from 'chalk';
import { Command } from 'commander';
import type { Profile } from '@/config/schema.js';
import {
  createProfile,
  getConfigPath,
  listProfiles,
  setActiveProfileName,
  setAgentModel,
  setProfileField,
} from '@/config/store.js';
import {
  formatError,
  formatHeader,
  formatLabel,
  formatSuccess,
  print,
  printJson,
} from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';

export const profileCommand = new Command('profile').description('Manage CLI profiles');

profileCommand
  .command('list')
  .description('List all profiles')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const profiles = await listProfiles();

      if (options.json) {
        printJson(profiles);
        return;
      }

      print(formatHeader('Profiles\n'));

      for (const { name, active, profile } of profiles) {
        const marker = active ? chalk.green('●') : chalk.dim('○');
        const label = active ? chalk.bold(name) : name;
        const activeLabel = active ? chalk.dim(' (active)') : '';
        const apiUrl = chalk.dim(profile.apiUrl);

        print(`  ${marker} ${label}${activeLabel} ${apiUrl}`);
        if (profile.darkroomHost !== '100.106.229.81') {
          print(`    ${chalk.dim(`darkroom: ${profile.darkroomHost}`)}`);
        }
        if (profile.agent.model) {
          print(`    ${chalk.dim(`agent model: ${profile.agent.model}`)}`);
        }
      }

      print();
      print(chalk.dim(`Config: ${getConfigPath()}`));
    } catch (error) {
      handleError(error);
    }
  });

profileCommand
  .command('use')
  .description('Set the active profile')
  .argument('<name>', 'Profile name')
  .action(async (name) => {
    try {
      await setActiveProfileName(name);
      print(formatSuccess(`Active profile: ${chalk.bold(name)}`));
    } catch (error) {
      handleError(error);
    }
  });

profileCommand
  .command('create')
  .description('Create a new profile')
  .argument('<name>', 'Profile name')
  .option('--api-url <url>', 'API URL')
  .option('--api-key <key>', 'API key')
  .option('--agent-model <model>', 'Default agent model for chat')
  .option('--darkroom-host <host>', 'Darkroom host address')
  .option('--role <role>', 'User role (user or admin)')
  .action(async (name, options) => {
    try {
      const profileOverrides = {
        ...(options.agentModel
          ? {
              agent: {
                lastThreadIdByOrganization: {},
                model: options.agentModel,
              },
            }
          : {}),
        ...(options.apiKey ? { apiKey: options.apiKey } : {}),
        ...(options.apiUrl ? { apiUrl: options.apiUrl } : {}),
        ...(options.darkroomHost ? { darkroomHost: options.darkroomHost } : {}),
        ...(options.role ? { role: options.role as 'user' | 'admin' } : {}),
      };

      await createProfile(name, profileOverrides);
      print(formatSuccess(`Profile "${name}" created`));
      print(chalk.dim(`Switch to it with: gf profile use ${name}`));
    } catch (error) {
      handleError(error);
    }
  });

profileCommand
  .command('set')
  .description('Update a profile field')
  .argument(
    '<field>',
    'Field name (api-url, api-key, agent-model, darkroom-host, role, active-persona)'
  )
  .argument('<value>', 'Field value')
  .option('-p, --profile <name>', 'Profile name (defaults to active)')
  .action(async (field, value, options) => {
    try {
      const fieldMap: Record<string, keyof import('@/config/schema.js').Profile> = {
        'active-brand': 'activeBrand',
        'active-persona': 'activePersona',
        'agent-model': 'agent',
        'api-key': 'apiKey',
        'api-url': 'apiUrl',
        'darkroom-host': 'darkroomHost',
        'darkroom-port': 'darkroomApiPort',
        role: 'role',
      };

      const mappedField = fieldMap[field];
      if (!mappedField) {
        console.error(formatError(`Unknown field: ${field}`));
        print(chalk.dim(`Valid fields: ${Object.keys(fieldMap).join(', ')}`));
        process.exit(1);
      }

      let finalValue: string | number = value;
      if (mappedField === 'darkroomApiPort') {
        finalValue = Number.parseInt(value, 10);
        if (Number.isNaN(finalValue)) {
          console.error(formatError(`Invalid port number: ${value}`));
          process.exit(1);
        }
      }
      if (mappedField === 'agent') {
        await setAgentModel(value, options.profile);
      } else {
        await setProfileField(
          mappedField as Exclude<keyof Profile, 'agent'>,
          finalValue as never,
          options.profile
        );
      }

      print(formatSuccess(`Set ${field} = ${value}`));
      if (options.profile) {
        print(formatLabel('Profile', options.profile));
      }
    } catch (error) {
      handleError(error);
    }
  });

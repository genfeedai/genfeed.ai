import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { get } from '@/api/client.js';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from '@/api/json-api.js';
import { requireAdmin } from '@/middleware/auth-guard.js';
import { formatHeader, formatLabel, formatWarning, print, printJson } from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';

interface Persona {
  id: string;
  handle: string;
  label: string;
  bio?: string;
  status?: string;
  createdAt: string;
}

export const personasCommand = new Command('personas')
  .description('List and manage personas [admin]')
  .option('--json', 'Output as JSON')
  .action(
    requireAdmin(async (options: { json?: boolean }) => {
      try {
        const spinner = ora('Fetching personas...').start();
        const response = await get<JsonApiCollectionResponse>('/personas');
        const personas = flattenCollection<Persona>(response);
        spinner.stop();

        if (options.json) {
          printJson(personas);
          return;
        }

        if (personas.length === 0) {
          print(formatWarning('No personas found.'));
          return;
        }

        print(formatHeader(`Personas (${personas.length})\n`));

        for (const persona of personas) {
          const status = persona.status === 'active' ? chalk.green('●') : chalk.dim('○');

          print(`  ${status} ${chalk.bold(persona.handle)} ${chalk.dim(`(${persona.label})`)}`);
          if (persona.bio) {
            print(`    ${chalk.dim(persona.bio.slice(0, 80))}`);
          }
        }
      } catch (error) {
        handleError(error);
      }
    })
  );

personasCommand
  .command('show')
  .description('Show persona details')
  .argument('<id>', 'Persona ID')
  .option('--json', 'Output as JSON')
  .action(
    requireAdmin(async (id: string, options: { json?: boolean }) => {
      try {
        const spinner = ora(`Fetching persona ${id}...`).start();
        const response = await get<JsonApiSingleResponse>(`/personas/${id}`);
        const persona = flattenSingle<Persona>(response);
        spinner.stop();

        if (options.json) {
          printJson(persona);
          return;
        }

        print(formatHeader(`${persona.label} (@${persona.handle})\n`));
        print(formatLabel('ID', persona.id));
        if (persona.bio) {
          print(formatLabel('Bio', persona.bio));
        }
        if (persona.status) {
          print(formatLabel('Status', persona.status));
        }
        print(formatLabel('Created', new Date(persona.createdAt).toLocaleDateString()));
      } catch (error) {
        handleError(error);
      }
    })
  );

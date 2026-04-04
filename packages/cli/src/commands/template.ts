import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client.js';
import {
  createTemplate,
  deleteTemplate,
  getPopularTemplates,
  getTemplate,
  listTemplates,
  suggestTemplates,
  useTemplate,
} from '@/api/templates.js';
import { formatHeader, formatLabel, formatSuccess, print, printJson } from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';

export const templateCommand = new Command('template').description('Manage content templates');

async function readPipedStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }

  return await new Promise<string>((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
}

templateCommand
  .command('list')
  .description('List templates')
  .option('--purpose <purpose>', 'Filter by purpose (prompt, workflow)')
  .option('--category <cat>', 'Filter by category')
  .option('-l, --limit <n>', 'Max items', Number.parseInt, 20)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching templates...').start();
      const templates = await listTemplates({
        category: options.category,
        limit: options.limit,
        purpose: options.purpose,
      });
      spinner.stop();

      if (templates.length === 0) {
        print(chalk.dim('No templates found.'));
        return;
      }

      if (options.json) {
        printJson(templates);
        return;
      }

      print(formatHeader(`\nTemplates (${templates.length}):\n`));

      for (const tpl of templates) {
        const purpose = tpl.purpose ? chalk.blue(`[${tpl.purpose}]`) : '';
        const category = tpl.category ? chalk.dim(`(${tpl.category})`) : '';
        print(`  ${chalk.cyan(tpl.label)} ${purpose} ${category}`);
        print(`  ${chalk.dim(tpl.id)}`);
        if (tpl.description) {
          print(`  ${chalk.dim(tpl.description)}`);
        }
        print();
      }
    } catch (error) {
      handleError(error);
    }
  });

templateCommand
  .command('show')
  .description('Show template details')
  .argument('<id>', 'Template ID')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching template...').start();
      const template = await getTemplate(id);
      spinner.stop();

      if (options.json) {
        printJson(template);
        return;
      }

      print(formatHeader('\nTemplate Details:\n'));
      print(formatLabel('ID', template.id));
      print(formatLabel('Label', template.label));
      if (template.description) {
        print(formatLabel('Description', template.description));
      }
      if (template.purpose) {
        print(formatLabel('Purpose', template.purpose));
      }
      if (template.category) {
        print(formatLabel('Category', template.category));
      }
      if (template.variables?.length) {
        print(formatLabel('Variables', template.variables.join(', ')));
      }
      if (template.content) {
        print();
        print(formatHeader('Content:\n'));
        print(chalk.dim(template.content));
      }
    } catch (error) {
      handleError(error);
    }
  });

templateCommand
  .command('create')
  .description('Create a template')
  .requiredOption('--label <label>', 'Template label')
  .option('--description <desc>', 'Template description')
  .option('--purpose <purpose>', 'Template purpose (prompt, workflow)')
  .option('--content <content>', 'Template content')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const content = options.content ?? (await readPipedStdin());
      if (!content) {
        throw new Error('Template content is required (use --content or pipe via stdin)');
      }

      const spinner = ora('Creating template...').start();
      const template = await createTemplate({
        content,
        description: options.description,
        label: options.label,
        purpose: options.purpose,
      });
      spinner.succeed('Template created');

      if (options.json) {
        printJson(template);
      } else {
        print(formatLabel('ID', template.id));
        print(formatLabel('Label', template.label));
      }
    } catch (error) {
      handleError(error);
    }
  });

templateCommand
  .command('use')
  .description('Fill a template with variables')
  .argument('<id>', 'Template ID')
  .option('--variables <json>', 'JSON object of template variables')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      await requireAuth();

      let variables: Record<string, string> | undefined;
      if (options.variables) {
        variables = JSON.parse(options.variables) as Record<string, string>;
      }

      const spinner = ora('Filling template...').start();
      const result = await useTemplate(id, { variables });
      spinner.succeed('Template filled');

      if (options.json) {
        printJson(result);
      } else {
        print();
        print(result.content);
      }
    } catch (error) {
      handleError(error);
    }
  });

templateCommand
  .command('popular')
  .description('List popular templates')
  .option('-l, --limit <n>', 'Max items', Number.parseInt, 10)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching popular templates...').start();
      const templates = await getPopularTemplates(options.limit);
      spinner.stop();

      if (templates.length === 0) {
        print(chalk.dim('No popular templates found.'));
        return;
      }

      if (options.json) {
        printJson(templates);
        return;
      }

      print(formatHeader(`\nPopular Templates (${templates.length}):\n`));

      for (const tpl of templates) {
        const usage = tpl.usageCount !== undefined ? chalk.dim(`(${tpl.usageCount} uses)`) : '';
        print(`  ${chalk.cyan(tpl.label)} ${usage}`);
        print(`  ${chalk.dim(tpl.id)}`);
        if (tpl.description) {
          print(`  ${chalk.dim(tpl.description)}`);
        }
        print();
      }
    } catch (error) {
      handleError(error);
    }
  });

templateCommand
  .command('suggest')
  .description('Get template suggestions')
  .requiredOption('--prompt <prompt>', 'Description of what you need')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Getting suggestions...').start();
      const suggestions = await suggestTemplates(options.prompt);
      spinner.stop();

      if (suggestions.length === 0) {
        print(chalk.dim('No suggestions found.'));
        return;
      }

      if (options.json) {
        printJson(suggestions);
        return;
      }

      print(formatHeader(`\nSuggested Templates (${suggestions.length}):\n`));

      for (const s of suggestions) {
        const score =
          s.relevanceScore !== undefined
            ? chalk.dim(`(${Math.round(s.relevanceScore * 100)}% match)`)
            : '';
        print(`  ${chalk.cyan(s.label)} ${score}`);
        print(`  ${chalk.dim(s.id)}`);
        if (s.description) {
          print(`  ${chalk.dim(s.description)}`);
        }
        print();
      }
    } catch (error) {
      handleError(error);
    }
  });

templateCommand
  .command('delete')
  .description('Delete a template')
  .argument('<id>', 'Template ID')
  .option('--force', 'Skip confirmation prompt')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      await requireAuth();

      if (!options.force) {
        const confirmed = await confirm({
          default: false,
          message: `Delete template ${id}?`,
        });
        if (!confirmed) {
          print(chalk.dim('Cancelled.'));
          return;
        }
      }

      const spinner = ora('Deleting template...').start();
      await deleteTemplate(id);
      spinner.succeed('Template deleted');

      if (options.json) {
        printJson({ deleted: true, id });
      } else {
        print(formatSuccess(`Template ${id} deleted`));
      }
    } catch (error) {
      handleError(error);
    }
  });

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { runCaption } from '@/api/darkroom-api.js';
import { requireAdmin } from '@/middleware/auth-guard.js';
import { print, printJson } from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';

export const captionCommand = new Command('caption')
  .description('Run Florence-2 auto-captioning on training dataset [admin]')
  .argument('<handle>', 'Persona handle (e.g., quincylandx)')
  .option('-t, --trigger <word>', 'Trigger word (defaults to handle)')
  .option('--json', 'Output as JSON')
  .action(
    requireAdmin(async (handle: string, options: { trigger?: string; json?: boolean }) => {
      try {
        const triggerWord = options.trigger ?? handle;

        const spinner = ora(`Captioning dataset for ${handle}...`).start();
        const result = await runCaption({
          persona_slug: handle,
          trigger_word: triggerWord,
        });
        spinner.succeed('Captioning complete');

        if (options.json) {
          printJson(result);
          return;
        }

        if (result.output) {
          print(chalk.dim(result.output));
        }
      } catch (error) {
        handleError(error);
      }
    })
  );

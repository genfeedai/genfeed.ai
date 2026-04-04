import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { getDataset, getTrainingStatus, startTraining } from '@/api/darkroom-api.js';
import { requireAdmin } from '@/middleware/auth-guard.js';
import { formatError, formatLabel, print, printJson } from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';
import {
  formatProgress,
  hasExceededTimeout,
  POLL_TIMEOUT_TRAINING,
  sleep,
} from '@/utils/helpers.js';

export const trainCommand = new Command('train')
  .description('LoRA training management [admin]')
  .argument('<handle>', 'Persona handle (e.g., quincylandx)')
  .option('-s, --steps <steps>', 'Training steps', Number.parseInt)
  .option('-r, --rank <rank>', 'LoRA rank', Number.parseInt)
  .option('-t, --trigger <word>', 'Trigger word (defaults to handle)')
  .option('--lr <rate>', 'Learning rate', Number.parseFloat)
  .option('--wait', 'Wait for training to complete')
  .option('--json', 'Output as JSON')
  .action(
    requireAdmin(
      async (
        handle: string,
        options: {
          steps?: number;
          rank?: number;
          trigger?: string;
          lr?: number;
          wait?: boolean;
          json?: boolean;
        }
      ) => {
        try {
          // Check dataset first
          const datasetSpinner = ora('Checking dataset...').start();
          const dataset = await getDataset(handle);
          datasetSpinner.stop();

          if (dataset.image_count === 0) {
            print(formatError(`No training images found for "${handle}".`));
            print(chalk.dim(`Upload images with: gf dataset upload ${handle} <path>`));
            return;
          }

          print(
            formatLabel(
              'Dataset',
              `${dataset.image_count} images, ${dataset.caption_count} captions`
            )
          );

          const triggerWord = options.trigger ?? handle;
          const loraName = `${handle}_zimage`;

          // Auto-tune steps based on image count if not specified
          let steps = options.steps;
          if (!steps) {
            if (dataset.image_count < 10) steps = 1000;
            else if (dataset.image_count < 15) steps = 1500;
            else if (dataset.image_count < 25) steps = 2000;
            else steps = 3000;
          }

          const spinner = ora('Starting training...').start();

          const result = await startTraining({
            learning_rate: options.lr ?? 4e-4,
            lora_name: loraName,
            lora_rank: options.rank ?? 16,
            persona_slug: handle,
            steps,
            trigger_word: triggerWord,
          });

          spinner.succeed('Training started');

          if (options.json) {
            printJson(result);
            if (!options.wait) return;
          } else {
            print(formatLabel('Job ID', result.job_id));
            print(formatLabel('Images', String(result.image_count)));
            print(formatLabel('Steps', String(steps)));
            print(formatLabel('Trigger', triggerWord));
            print(formatLabel('LoRA Name', loraName));
          }

          if (!options.wait) {
            print();
            print(chalk.dim(`Check progress with: gf train status ${result.job_id}`));
            return;
          }

          // Poll for completion
          print();
          const pollSpinner = ora('Training in progress...').start();
          const pollStart = Date.now();

          while (true) {
            if (hasExceededTimeout(pollStart, POLL_TIMEOUT_TRAINING)) {
              pollSpinner.fail(
                'Training polling timed out (2h). Job may still be running on the server.'
              );
              break;
            }

            await sleep(5000);
            const status = await getTrainingStatus(result.job_id);

            pollSpinner.text = `Training: ${status.stage} ${formatProgress(status.progress)}`;

            if (status.status === 'completed') {
              pollSpinner.succeed(`Training completed: ${status.lora_name}`);
              break;
            }

            if (status.status === 'failed') {
              pollSpinner.fail(`Training failed: ${status.error ?? 'Unknown error'}`);
              break;
            }
          }
        } catch (error) {
          handleError(error);
        }
      }
    )
  );

trainCommand
  .command('status')
  .description('Check training job status')
  .argument('<jobId>', 'Training job ID')
  .option('--json', 'Output as JSON')
  .option('--watch', 'Watch for updates until completion')
  .action(
    requireAdmin(async (jobId: string, options: { json?: boolean; watch?: boolean }) => {
      try {
        const spinner = ora('Fetching training status...').start();
        let status = await getTrainingStatus(jobId);
        spinner.stop();

        if (options.json && !options.watch) {
          printJson(status);
          return;
        }

        const printStatus = (s: typeof status) => {
          print(formatLabel('Job ID', s.job_id));
          print(formatLabel('Status', s.status));
          print(formatLabel('Stage', s.stage));
          print(formatLabel('Progress', formatProgress(s.progress)));
          print(formatLabel('Persona', s.persona_slug));
          print(formatLabel('LoRA', s.lora_name));
          print(formatLabel('Images', String(s.image_count)));
          print(formatLabel('Started', new Date(s.started_at).toLocaleString()));
          if (s.completed_at) {
            print(formatLabel('Completed', new Date(s.completed_at).toLocaleString()));
          }
          if (s.error) {
            print(formatLabel('Error', chalk.red(s.error)));
          }
        };

        printStatus(status);

        if (!options.watch || status.status === 'completed' || status.status === 'failed') {
          return;
        }

        print();
        const watchSpinner = ora('Watching training...').start();
        const watchStart = Date.now();

        while (true) {
          if (hasExceededTimeout(watchStart, POLL_TIMEOUT_TRAINING)) {
            watchSpinner.fail('Watch timed out (2h). Job may still be running on the server.');
            break;
          }

          await sleep(5000);
          status = await getTrainingStatus(jobId);
          watchSpinner.text = `${status.stage} ${formatProgress(status.progress)}`;

          if (status.status === 'completed') {
            watchSpinner.succeed('Training completed');
            break;
          }

          if (status.status === 'failed') {
            watchSpinner.fail(`Training failed: ${status.error ?? 'Unknown error'}`);
            break;
          }
        }
      } catch (error) {
        handleError(error);
      }
    })
  );

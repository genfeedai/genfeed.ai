import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import {
  comfyAction,
  getDarkroomHealth,
  getGenerateStatus,
  listLoras,
  listPersonas,
  startBootstrap,
  startContentGenerate,
  startFaceTest,
  startPulid,
} from '@/api/darkroom-api.js';
import { requireAdmin } from '@/middleware/auth-guard.js';
import {
  formatError,
  formatHeader,
  formatLabel,
  formatSuccess,
  formatWarning,
  print,
  printJson,
} from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';
import {
  formatProgress,
  hasExceededTimeout,
  POLL_TIMEOUT_GENERATION,
  sleep,
} from '@/utils/helpers.js';

export const darkroomCommand = new Command('darkroom')
  .description('Darkroom infrastructure management [admin]')
  .addCommand(
    new Command('health')
      .description('Show darkroom status (VRAM, temp, disk, ComfyUI)')
      .option('--json', 'Output as JSON')
      .action(
        requireAdmin(async (options: { json?: boolean }) => {
          try {
            const spinner = ora('Fetching darkroom health...').start();
            const health = await getDarkroomHealth();
            spinner.stop();

            if (options.json) {
              printJson(health);
              return;
            }

            const gpu = health.gpu;
            const vramUsedGb = (gpu.memory_used / 1024).toFixed(1);
            const vramTotalGb = (gpu.memory_total / 1024).toFixed(1);
            const vramPercent = ((gpu.memory_used / gpu.memory_total) * 100).toFixed(0);

            print(formatHeader('Darkroom Status\n'));
            print(formatLabel('GPU', gpu.name));
            print(formatLabel('VRAM', `${vramUsedGb}/${vramTotalGb} GB (${vramPercent}%)`));
            print(formatLabel('Utilization', `${gpu.utilization}%`));
            print(formatLabel('Temperature', `${gpu.temperature}°C`));

            print();
            print(formatHeader('Disk\n'));
            const root = health.disk.root;
            print(formatLabel('Root', `${root.used}/${root.total} (${root.percent})`));
            if (health.disk.comfyui) {
              const comfy = health.disk.comfyui;
              print(formatLabel('ComfyUI', `${comfy.used}/${comfy.total} (${comfy.percent})`));
            }
          } catch (error) {
            handleError(error);
          }
        })
      )
  )
  .addCommand(
    new Command('comfy')
      .description('Manage ComfyUI service')
      .argument('<action>', 'Action: start, stop, restart, status')
      .option('--json', 'Output as JSON')
      .action(
        requireAdmin(async (action: string, options: { json?: boolean }) => {
          try {
            const validActions = ['start', 'stop', 'restart', 'status'] as const;
            if (!validActions.includes(action as (typeof validActions)[number])) {
              console.error(
                formatError(`Invalid action: ${action}. Use: ${validActions.join(', ')}`)
              );
              process.exit(1);
            }

            const spinner = ora(
              `${action === 'status' ? 'Checking' : `${action.charAt(0).toUpperCase()}${action.slice(1)}ing`} ComfyUI...`
            ).start();
            const result = await comfyAction(action as 'start' | 'stop' | 'restart' | 'status');
            spinner.stop();

            if (options.json) {
              printJson(result);
              return;
            }

            if (result.returncode === 0) {
              print(formatSuccess(`ComfyUI ${action}: success`));
            } else {
              print(formatError(`ComfyUI ${action}: failed (exit code ${result.returncode})`));
            }

            if (result.stdout) {
              print(chalk.dim(result.stdout));
            }
            if (result.stderr) {
              print(formatWarning(result.stderr));
            }
          } catch (error) {
            handleError(error);
          }
        })
      )
  )
  .addCommand(
    new Command('loras')
      .description('List available LoRA models')
      .option('--json', 'Output as JSON')
      .action(
        requireAdmin(async (options: { json?: boolean }) => {
          try {
            const spinner = ora('Fetching LoRAs...').start();
            const result = await listLoras();
            spinner.stop();

            if (options.json) {
              printJson(result);
              return;
            }

            if (result.loras.length === 0) {
              print(formatWarning('No LoRA models found.'));
              return;
            }

            print(formatHeader(`LoRA Models (${result.loras.length})\n`));

            for (const lora of result.loras) {
              const date = new Date(lora.modified).toLocaleDateString();
              print(`  ${chalk.bold(lora.name)}`);
              print(`    ${chalk.dim(`${lora.size_mb.toFixed(1)} MB | ${date}`)}`);
            }
          } catch (error) {
            handleError(error);
          }
        })
      )
  )
  .addCommand(
    new Command('personas')
      .description('List available persona configs on GPU')
      .option('--json', 'Output as JSON')
      .action(
        requireAdmin(async (options: { json?: boolean }) => {
          try {
            const spinner = ora('Fetching personas...').start();
            const result = await listPersonas();
            spinner.stop();

            if (options.json) {
              printJson(result);
              return;
            }

            if (result.personas.length === 0) {
              print(formatWarning('No persona configs found.'));
              return;
            }

            print(formatHeader(`Personas (${result.personas.length})\n`));
            for (const p of result.personas) {
              if (p.error) {
                print(`  ${chalk.red(p.handle)} ${chalk.dim(`(${p.error})`)}`);
              } else {
                const pulid = p.has_pulid ? chalk.green('pulid') : chalk.dim('no pulid');
                print(`  ${chalk.bold(p.handle)}`);
                print(`    ${chalk.dim(`LoRA: ${p.lora_file} | ${pulid}`)}`);
              }
            }
          } catch (error) {
            handleError(error);
          }
        })
      )
  )
  .addCommand(buildGenerateCommand());

function buildGenerateCommand(): Command {
  const generate = new Command('generate').description(
    'Generate images using persona configs [admin]'
  );

  generate
    .command('face-test')
    .description('Run face fidelity test (3 configs x N prompts)')
    .argument('<handle>', 'Persona handle (e.g., itsshaylamonroe)')
    .option('--wait', 'Wait for generation to complete')
    .option('--json', 'Output as JSON')
    .action(
      requireAdmin(async (handle: string, options: { wait?: boolean; json?: boolean }) => {
        try {
          const spinner = ora(`Starting face test for ${handle}...`).start();
          const result = await startFaceTest(handle);
          spinner.succeed('Face test started');

          if (options.json && !options.wait) {
            printJson(result);
            return;
          }

          print(formatLabel('Job ID', result.job_id));
          print(formatLabel('Images', String(result.images_total)));

          if (!options.wait) {
            print();
            print(chalk.dim(`Check progress: gf darkroom generate status ${result.job_id}`));
            return;
          }

          await pollGenerateJob(result.job_id, options.json);
        } catch (error) {
          handleError(error);
        }
      })
    );

  generate
    .command('bootstrap')
    .description('Generate N images from existing LoRA for dataset expansion')
    .argument('<handle>', 'Persona handle')
    .option('-c, --count <count>', 'Number of images', Number.parseInt)
    .option('--wait', 'Wait for generation to complete')
    .option('--json', 'Output as JSON')
    .action(
      requireAdmin(
        async (handle: string, options: { count?: number; wait?: boolean; json?: boolean }) => {
          try {
            const count = options.count ?? 50;
            const spinner = ora(`Starting bootstrap for ${handle} (${count} images)...`).start();
            const result = await startBootstrap(handle, count);
            spinner.succeed('Bootstrap started');

            if (options.json && !options.wait) {
              printJson(result);
              return;
            }

            print(formatLabel('Job ID', result.job_id));
            print(formatLabel('Images', String(result.images_total)));

            if (!options.wait) {
              print();
              print(chalk.dim(`Check progress: gf darkroom generate status ${result.job_id}`));
              return;
            }

            await pollGenerateJob(result.job_id, options.json);
          } catch (error) {
            handleError(error);
          }
        }
      )
    );

  generate
    .command('pulid')
    .description('Generate PuLID face-consistent images')
    .argument('<handle>', 'Persona handle')
    .option('-m, --mode <mode>', 'Mode: scenes or angles', 'scenes')
    .option('--wait', 'Wait for generation to complete')
    .option('--json', 'Output as JSON')
    .action(
      requireAdmin(
        async (handle: string, options: { mode?: string; wait?: boolean; json?: boolean }) => {
          try {
            const mode = options.mode ?? 'scenes';
            const spinner = ora(`Starting PuLID generation for ${handle} (${mode})...`).start();
            const result = await startPulid(handle, mode);
            spinner.succeed('PuLID generation started');

            if (options.json && !options.wait) {
              printJson(result);
              return;
            }

            print(formatLabel('Job ID', result.job_id));
            print(formatLabel('Images', String(result.images_total)));

            if (!options.wait) {
              print();
              print(chalk.dim(`Check progress: gf darkroom generate status ${result.job_id}`));
              return;
            }

            await pollGenerateJob(result.job_id, options.json);
          } catch (error) {
            handleError(error);
          }
        }
      )
    );

  generate
    .command('content')
    .description('Generate content images from LoRA')
    .argument('<handle>', 'Persona handle')
    .option('--wait', 'Wait for generation to complete')
    .option('--json', 'Output as JSON')
    .action(
      requireAdmin(async (handle: string, options: { wait?: boolean; json?: boolean }) => {
        try {
          const spinner = ora(`Starting content generation for ${handle}...`).start();
          const result = await startContentGenerate(handle);
          spinner.succeed('Content generation started');

          if (options.json && !options.wait) {
            printJson(result);
            return;
          }

          print(formatLabel('Job ID', result.job_id));
          print(formatLabel('Images', String(result.images_total)));

          if (!options.wait) {
            print();
            print(chalk.dim(`Check progress: gf darkroom generate status ${result.job_id}`));
            return;
          }

          await pollGenerateJob(result.job_id, options.json);
        } catch (error) {
          handleError(error);
        }
      })
    );

  generate
    .command('status')
    .description('Check generation job status')
    .argument('<jobId>', 'Generation job ID')
    .option('--watch', 'Watch for updates until completion')
    .option('--json', 'Output as JSON')
    .action(
      requireAdmin(async (jobId: string, options: { watch?: boolean; json?: boolean }) => {
        try {
          const spinner = ora('Fetching generation status...').start();
          const status = await getGenerateStatus(jobId);
          spinner.stop();

          if (options.json && !options.watch) {
            printJson(status);
            return;
          }

          print(formatLabel('Job ID', status.job_id));
          print(formatLabel('Type', status.job_type));
          print(formatLabel('Status', status.status));
          print(formatLabel('Persona', status.persona));
          print(formatLabel('Images', `${status.images_completed}/${status.images_total}`));
          print(formatLabel('Progress', formatProgress(status.progress)));
          print(formatLabel('Started', new Date(status.started_at).toLocaleString()));
          if (status.completed_at) {
            print(formatLabel('Completed', new Date(status.completed_at).toLocaleString()));
          }
          if (status.error) {
            print(formatLabel('Error', chalk.red(status.error)));
          }

          if (!options.watch || status.status === 'completed' || status.status === 'failed') {
            return;
          }

          await pollGenerateJob(jobId, options.json);
        } catch (error) {
          handleError(error);
        }
      })
    );

  return generate;
}

async function pollGenerateJob(jobId: string, json?: boolean): Promise<void> {
  print();
  const pollSpinner = ora('Generating...').start();
  const pollStart = Date.now();

  while (true) {
    if (hasExceededTimeout(pollStart, POLL_TIMEOUT_GENERATION)) {
      pollSpinner.fail(
        'Generation polling timed out (30m). Job may still be running on the server.'
      );
      break;
    }

    await sleep(5000);
    const status = await getGenerateStatus(jobId);

    pollSpinner.text = `Generating: ${status.images_completed}/${status.images_total} ${formatProgress(status.progress)}`;

    if (status.status === 'completed') {
      pollSpinner.succeed(
        `Generation complete: ${status.images_completed}/${status.images_total} images`
      );
      if (json) {
        printJson(status);
      } else if (status.filenames.length > 0) {
        print(chalk.dim('\nGenerated files:'));
        for (const f of status.filenames.slice(0, 20)) {
          print(chalk.dim(`  ${f}`));
        }
        if (status.filenames.length > 20) {
          print(chalk.dim(`  ... and ${status.filenames.length - 20} more`));
        }
      }
      break;
    }

    if (status.status === 'failed') {
      pollSpinner.fail(`Generation failed: ${status.error ?? 'Unknown error'}`);
      break;
    }
  }
}

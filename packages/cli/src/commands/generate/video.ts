import { writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client.js';
import { createVideo, getVideo, type Video } from '@/api/videos.js';
import { getActiveBrand, getActiveProfile } from '@/config/store.js';
import { formatLabel, print, printJson } from '@/ui/theme.js';
import { handleError, NoBrandError } from '@/utils/errors.js';
import { waitForCompletion } from '@/utils/websocket.js';

export const videoCommand = new Command('video')
  .description('Generate an AI video')
  .argument('<prompt>', 'The prompt describing the video to generate')
  .option('-m, --model <model>', 'Model to use for generation')
  .option('-d, --duration <seconds>', 'Video duration in seconds', Number.parseInt)
  .option('-r, --resolution <res>', 'Video resolution (720p, 1080p, 4k)')
  .option('-b, --brand <id>', 'Brand ID (overrides active brand)')
  .option('-o, --output <path>', 'Download video to file')
  .option('--no-wait', 'Do not wait for generation to complete')
  .option('--json', 'Output as JSON')
  .action(async (prompt, options) => {
    try {
      await requireAuth();

      const activeBrandId = await getActiveBrand();
      const brandId = options.brand ?? activeBrandId;
      if (!brandId) {
        throw new NoBrandError();
      }

      const { profile } = await getActiveProfile();
      const model = options.model ?? profile.defaults.videoModel;

      const spinner = ora('Creating video...').start();

      const video = await createVideo({
        brand: brandId,
        duration: options.duration,
        model,
        resolution: options.resolution,
        text: prompt,
      });

      if (!options.wait) {
        spinner.succeed('Video generation started');

        if (options.json) {
          printJson({ id: video.id, status: video.status });
        } else {
          print(formatLabel('ID', video.id));
          print(formatLabel('Status', video.status));
          print();
          print(chalk.dim(`Check status with: gf status ${video.id}`));
        }
        return;
      }

      spinner.text = 'Generating video...';

      const { result, elapsed } = await waitForCompletion<Video>({
        getResult: () => getVideo(video.id),
        spinner,
        taskId: video.id,
        taskType: 'VIDEO',
        timeout: 600000,
      });

      const elapsedSec = (elapsed / 1000).toFixed(1);
      spinner.succeed(`Video generated (${elapsedSec}s)`);

      if (options.json) {
        printJson({
          duration: result.duration,
          elapsed: elapsed,
          id: result.id,
          model: result.model,
          resolution: result.resolution,
          status: result.status,
          url: result.url,
        });
      } else {
        print(formatLabel('URL', result.url ?? 'N/A'));
        if (result.duration) {
          print(formatLabel('Duration', `${result.duration}s`));
        }
        if (result.resolution) {
          print(formatLabel('Resolution', result.resolution));
        }
        print(formatLabel('Model', result.model));
      }

      if (options.output && result.url) {
        const downloadSpinner = ora('Downloading video...').start();
        try {
          const response = await fetch(result.url);
          if (!response.ok) {
            throw new Error(`Failed to download: ${response.statusText}`);
          }
          const buffer = await response.arrayBuffer();
          await writeFile(options.output, Buffer.from(buffer));
          downloadSpinner.succeed(`Saved to ${options.output}`);
        } catch (err) {
          downloadSpinner.fail('Failed to download video');
          throw err;
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client.js';
import { createVideo, getVideo, type Video } from '@/api/videos.js';
import { getActiveProfile } from '@/config/store.js';
import { handleError } from '@/utils/errors.js';
import {
  downloadGeneratedFile,
  printGeneratedResult,
  printGenerationStarted,
  requireGenerationBrand,
  waitForGenerated,
} from './helpers.js';

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

      const brandId = await requireGenerationBrand(options.brand);
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
        printGenerationStarted(video.id, video.status, options.json);
        return;
      }

      const { result, elapsed } = await waitForGenerated<Video>(
        spinner,
        'video',
        'Video',
        () => getVideo(video.id),
        video.id,
        'VIDEO',
        600000
      );

      printGeneratedResult(
        options.json,
        {
          duration: result.duration,
          elapsed,
          id: result.id,
          model: result.model,
          resolution: result.resolution,
          status: result.status,
          url: result.url,
        },
        [
          ['URL', result.url ?? 'N/A'],
          result.duration ? ['Duration', `${result.duration}s`] : false,
          result.resolution ? ['Resolution', result.resolution] : false,
          ['Model', result.model],
        ]
      );

      if (options.output && result.url) {
        await downloadGeneratedFile('video', options.output, result.url);
      }
    } catch (error) {
      handleError(error);
    }
  });

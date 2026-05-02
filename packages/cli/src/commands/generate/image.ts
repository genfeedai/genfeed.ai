import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client.js';
import { createImage, getImage, type Image } from '@/api/images.js';
import { getActiveProfile } from '@/config/store.js';
import { handleError } from '@/utils/errors.js';
import {
  downloadGeneratedFile,
  printGeneratedResult,
  printGenerationStarted,
  requireGenerationBrand,
  waitForGenerated,
} from './helpers.js';

export const imageCommand = new Command('image')
  .description('Generate an AI image')
  .argument('<prompt>', 'The prompt describing the image to generate')
  .option('-m, --model <model>', 'Model to use for generation')
  .option('-w, --width <width>', 'Image width in pixels', Number.parseInt)
  .option('-h, --height <height>', 'Image height in pixels', Number.parseInt)
  .option('-b, --brand <id>', 'Brand ID (overrides active brand)')
  .option('-o, --output <path>', 'Download image to file')
  .option('--no-wait', 'Do not wait for generation to complete')
  .option('--json', 'Output as JSON')
  .action(async (prompt, options) => {
    try {
      await requireAuth();

      const brandId = await requireGenerationBrand(options.brand);
      const { profile } = await getActiveProfile();
      const model = options.model ?? profile.defaults.imageModel;

      const spinner = ora('Creating image...').start();

      const image = await createImage({
        brand: brandId,
        height: options.height,
        model,
        text: prompt,
        width: options.width,
      });

      if (!options.wait) {
        spinner.succeed('Image generation started');
        printGenerationStarted(image.id, image.status, options.json);
        return;
      }

      const { result, elapsed } = await waitForGenerated<Image>(
        spinner,
        'image',
        'Image',
        () => getImage(image.id),
        image.id,
        'IMAGE',
        300000
      );

      printGeneratedResult(
        options.json,
        {
          elapsed,
          height: result.height,
          id: result.id,
          model: result.model,
          status: result.status,
          url: result.url,
          width: result.width,
        },
        [
          ['URL', result.url ?? 'N/A'],
          result.width && result.height
            ? ['Dimensions', `${result.width} × ${result.height}`]
            : false,
          ['Model', result.model],
        ]
      );

      if (options.output && result.url) {
        await downloadGeneratedFile('image', options.output, result.url);
      }
    } catch (error) {
      handleError(error);
    }
  });

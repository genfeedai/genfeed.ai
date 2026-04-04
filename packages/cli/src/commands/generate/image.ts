import { writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client.js';
import { createImage, getImage, type Image } from '@/api/images.js';
import { getActiveBrand, getActiveProfile } from '@/config/store.js';
import { formatLabel, print, printJson } from '@/ui/theme.js';
import { handleError, NoBrandError } from '@/utils/errors.js';
import { waitForCompletion } from '@/utils/websocket.js';

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

      const activeBrandId = await getActiveBrand();
      const brandId = options.brand ?? activeBrandId;
      if (!brandId) {
        throw new NoBrandError();
      }

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

        if (options.json) {
          printJson({ id: image.id, status: image.status });
        } else {
          print(formatLabel('ID', image.id));
          print(formatLabel('Status', image.status));
          print();
          print(chalk.dim(`Check status with: gf status ${image.id}`));
        }
        return;
      }

      spinner.text = 'Generating image...';

      const { result, elapsed } = await waitForCompletion<Image>({
        getResult: () => getImage(image.id),
        spinner,
        taskId: image.id,
        taskType: 'IMAGE',
        timeout: 300000,
      });

      const elapsedSec = (elapsed / 1000).toFixed(1);
      spinner.succeed(`Image generated (${elapsedSec}s)`);

      if (options.json) {
        printJson({
          elapsed: elapsed,
          height: result.height,
          id: result.id,
          model: result.model,
          status: result.status,
          url: result.url,
          width: result.width,
        });
      } else {
        print(formatLabel('URL', result.url ?? 'N/A'));
        if (result.width && result.height) {
          print(formatLabel('Dimensions', `${result.width} × ${result.height}`));
        }
        print(formatLabel('Model', result.model));
      }

      if (options.output && result.url) {
        const downloadSpinner = ora('Downloading image...').start();
        try {
          const response = await fetch(result.url);
          if (!response.ok) {
            throw new Error(`Failed to download: ${response.statusText}`);
          }
          const buffer = await response.arrayBuffer();
          await writeFile(options.output, Buffer.from(buffer));
          downloadSpinner.succeed(`Saved to ${options.output}`);
        } catch (err) {
          downloadSpinner.fail('Failed to download image');
          throw err;
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

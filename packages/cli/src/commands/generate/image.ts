import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client';
import { createImage, getImage, type Image } from '@/api/images';
import { getActiveProfile } from '@/config/store';
import { handleError } from '@/utils/errors';
import {
  downloadGeneratedFile,
  printGeneratedResult,
  printGenerationStarted,
  requireGenerationBrand,
  waitForGenerated,
} from './helpers';

export const imageCommand = new Command('image')
  .description('Generate an AI image')
  .argument('<prompt>', 'The prompt describing the image to generate')
  .option('-m, --model <model>', 'Model to use for generation')
  .option('-w, --width <width>', 'Image width in pixels', Number.parseInt)
  .option('-h, --height <height>', 'Image height in pixels', Number.parseInt)
  .option('--seed <seed>', 'Deterministic generation seed', Number.parseInt)
  .option('--outputs <count>', 'Number of outputs', Number.parseInt)
  .option('--reference <id...>', 'Source image ingredient IDs')
  .option('--style <style>', 'Artistic or visual style')
  .option('--format <format>', 'Output composition format')
  .option('--mood <mood>', 'Mood direction')
  .option('--camera <camera>', 'Camera angle')
  .option('--lens <lens>', 'Lens direction')
  .option('--scene <scene>', 'Scene direction')
  .option('--lighting <lighting>', 'Lighting direction')
  .option('--font-family <family>', 'Font family for generated text')
  .option('--negative-prompt <prompt>', 'Elements to avoid')
  .option('--blacklist <key...>', 'Blacklist element keys')
  .option('--tag <id...>', 'Tag IDs to attach')
  .option('--auto-model', 'Let Genfeed select the generation model')
  .option('--prioritize <priority>', 'Auto-model priority: quality, speed, cost, balanced')
  .option('--branding <mode>', 'Brand context: off or brand')
  .option('--fidelity <mode>', 'Generation brief fidelity: off, guided, strict')
  .option('--no-brand-assets', 'Disable brand asset inclusion')
  .option('--prompt-template <key>', 'Prompt template key')
  .option('--no-template', 'Disable prompt templates')
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
        autoSelectModel: options.autoModel,
        blacklist: options.blacklist,
        brandId,
        brandingMode: options.branding,
        camera: options.camera,
        fidelityMode: options.fidelity,
        fontFamily: options.fontFamily,
        format: options.format,
        height: options.height,
        isBrandingEnabled: options.brandAssets,
        lens: options.lens,
        lighting: options.lighting,
        model,
        mood: options.mood,
        negativePrompt: options.negativePrompt,
        outputs: options.outputs,
        prioritize: options.prioritize,
        promptTemplate: options.promptTemplate,
        references: options.reference,
        scene: options.scene,
        seed: options.seed,
        style: options.style,
        tags: options.tag,
        text: prompt,
        useTemplate: options.template,
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

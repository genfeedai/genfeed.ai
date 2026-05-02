import { Command } from 'commander';
import ora from 'ora';
import { type Article, generateXArticle, getArticle } from '@/api/articles.js';
import { requireAuth } from '@/api/client.js';
import { handleError } from '@/utils/errors.js';
import {
  printGeneratedResult,
  printGenerationStarted,
  requireGenerationBrand,
  waitForGenerated,
} from './helpers.js';

export const articleXCommand = new Command('article-x')
  .description('Generate a long-form X (Twitter) article')
  .argument('<prompt>', 'The prompt describing the article to generate')
  .option('-b, --brand <id>', 'Brand ID (overrides active brand)')
  .option('--no-wait', 'Return immediately without waiting')
  .option('--json', 'Output as JSON')
  .action(async (prompt, options) => {
    try {
      await requireAuth();

      const brandId = await requireGenerationBrand(options.brand);
      const spinner = ora('Creating X article...').start();

      const activity = await generateXArticle({
        brand: brandId,
        prompt,
      });

      if (!options.wait) {
        spinner.succeed('X article generation started');
        printGenerationStarted(
          activity.id,
          activity.status,
          options.json,
          'article',
          activity.articleId
        );
        return;
      }

      const { result, elapsed } = await waitForGenerated<Article>(
        spinner,
        'X article',
        'X article',
        () => getArticle(activity.articleId ?? activity.id),
        activity.id,
        'IMAGE',
        300000
      );

      printGeneratedResult(
        options.json,
        {
          elapsed,
          id: result.id,
          status: result.status,
          summary: result.summary,
          title: result.title,
          wordCount: result.wordCount,
        },
        [
          result.title ? ['Title', result.title] : false,
          result.summary ? ['Summary', result.summary] : false,
          result.wordCount ? ['Words', String(result.wordCount)] : false,
        ]
      );
    } catch (error) {
      handleError(error);
    }
  });

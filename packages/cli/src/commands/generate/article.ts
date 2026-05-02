import { Command } from 'commander';
import ora from 'ora';
import { type Article, generateArticle, getArticle } from '@/api/articles.js';
import { requireAuth } from '@/api/client.js';
import { handleError } from '@/utils/errors.js';
import {
  printGeneratedResult,
  printGenerationStarted,
  requireGenerationBrand,
  waitForGenerated,
} from './helpers.js';

export const articleCommand = new Command('article')
  .description('Generate an AI article')
  .argument('<prompt>', 'The prompt describing the article to generate')
  .option('-c, --count <n>', 'Number of articles to generate', Number.parseInt, 1)
  .option('-b, --brand <id>', 'Brand ID (overrides active brand)')
  .option('--category <cat>', 'Article category')
  .option('--no-wait', 'Return immediately without waiting')
  .option('--json', 'Output as JSON')
  .action(async (prompt, options) => {
    try {
      await requireAuth();

      const brandId = await requireGenerationBrand(options.brand);
      const spinner = ora('Creating article...').start();

      const activity = await generateArticle({
        brand: brandId,
        category: options.category,
        count: options.count,
        prompt,
      });

      if (!options.wait) {
        spinner.succeed('Article generation started');
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
        'article',
        'Article',
        () => getArticle(activity.articleId ?? activity.id),
        activity.id,
        'IMAGE',
        300000
      );

      printGeneratedResult(
        options.json,
        {
          category: result.category,
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
          result.category ? ['Category', result.category] : false,
        ]
      );
    } catch (error) {
      handleError(error);
    }
  });

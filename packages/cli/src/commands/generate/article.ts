import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { type Article, generateArticle, getArticle } from '@/api/articles.js';
import { requireAuth } from '@/api/client.js';
import { getActiveBrand } from '@/config/store.js';
import { formatLabel, print, printJson } from '@/ui/theme.js';
import { handleError, NoBrandError } from '@/utils/errors.js';
import { waitForCompletion } from '@/utils/websocket.js';

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

      const activeBrandId = await getActiveBrand();
      const brandId = options.brand ?? activeBrandId;
      if (!brandId) {
        throw new NoBrandError();
      }

      const spinner = ora('Creating article...').start();

      const activity = await generateArticle({
        brand: brandId,
        category: options.category,
        count: options.count,
        prompt,
      });

      if (!options.wait) {
        spinner.succeed('Article generation started');
        const articleStatusId = activity.articleId ?? activity.id;

        if (options.json) {
          printJson({
            articleId: activity.articleId,
            id: activity.id,
            status: activity.status,
            statusCommand: `gf status ${articleStatusId} --type article`,
          });
        } else {
          print(formatLabel('ID', activity.id));
          print(formatLabel('Status', activity.status));
          if (activity.articleId) {
            print(formatLabel('Article ID', activity.articleId));
          }
          print();
          print(chalk.dim(`Check status with: gf status ${articleStatusId} --type article`));
        }
        return;
      }

      spinner.text = 'Generating article...';

      const { result, elapsed } = await waitForCompletion<Article>({
        getResult: () => getArticle(activity.articleId ?? activity.id),
        spinner,
        taskId: activity.id,
        taskType: 'IMAGE', // reuse existing websocket event type
        timeout: 300000,
      });

      const elapsedSec = (elapsed / 1000).toFixed(1);
      spinner.succeed(`Article generated (${elapsedSec}s)`);

      if (options.json) {
        printJson({
          category: result.category,
          elapsed,
          id: result.id,
          status: result.status,
          summary: result.summary,
          title: result.title,
          wordCount: result.wordCount,
        });
      } else {
        if (result.title) {
          print(formatLabel('Title', result.title));
        }
        if (result.summary) {
          print(formatLabel('Summary', result.summary));
        }
        if (result.wordCount) {
          print(formatLabel('Words', String(result.wordCount)));
        }
        if (result.category) {
          print(formatLabel('Category', result.category));
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { type Article, generateXArticle, getArticle } from '@/api/articles.js';
import { requireAuth } from '@/api/client.js';
import { getActiveBrand } from '@/config/store.js';
import { formatLabel, print, printJson } from '@/ui/theme.js';
import { handleError, NoBrandError } from '@/utils/errors.js';
import { waitForCompletion } from '@/utils/websocket.js';

export const articleXCommand = new Command('article-x')
  .description('Generate a long-form X (Twitter) article')
  .argument('<prompt>', 'The prompt describing the article to generate')
  .option('-b, --brand <id>', 'Brand ID (overrides active brand)')
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

      const spinner = ora('Creating X article...').start();

      const activity = await generateXArticle({
        brand: brandId,
        prompt,
      });

      if (!options.wait) {
        spinner.succeed('X article generation started');
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

      spinner.text = 'Generating X article...';

      const { result, elapsed } = await waitForCompletion<Article>({
        getResult: () => getArticle(activity.articleId ?? activity.id),
        spinner,
        taskId: activity.id,
        taskType: 'IMAGE',
        timeout: 300000,
      });

      const elapsedSec = (elapsed / 1000).toFixed(1);
      spinner.succeed(`X article generated (${elapsedSec}s)`);

      if (options.json) {
        printJson({
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
      }
    } catch (error) {
      handleError(error);
    }
  });

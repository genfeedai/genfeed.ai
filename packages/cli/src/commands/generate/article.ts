import { Command } from 'commander';
import ora from 'ora';
import { type Article, generateArticle } from '@/api/articles';
import { requireAuth } from '@/api/client';
import { printJson } from '@/ui/theme';
import { handleError } from '@/utils/errors';
import { parseKeywords, printArticle, requireGenerationBrand } from './helpers';

function toJsonSummary(article: Article): Record<string, unknown> {
  return {
    category: article.category,
    id: article.id,
    slug: article.slug,
    status: article.status,
    summary: article.summary,
    title: article.label,
  };
}

export const articleCommand = new Command('article')
  .description('Generate an AI article')
  .argument('<prompt>', 'The prompt describing the article to generate')
  .option('-c, --count <n>', 'Number of articles to generate (1-4)', Number.parseInt, 1)
  .option('-b, --brand <id>', 'Brand ID (overrides active brand)')
  .option('--category <cat>', 'Article category')
  .option('--keywords <list>', 'Comma-separated keywords to steer the article')
  .option('--json', 'Output as JSON')
  .action(async (prompt, options) => {
    try {
      await requireAuth();

      // `POST /articles/generations` runs the generate/review/update cycle
      // inline, so this call blocks until the articles are finished.
      const brandId = await requireGenerationBrand(options.brand);
      const spinner = ora('Generating article...').start();
      const startedAt = Date.now();

      const articles = await generateArticle({
        brandId,
        category: options.category,
        count: options.count,
        keywords: parseKeywords(options.keywords),
        prompt,
        type: 'standard',
      });

      const elapsed = Date.now() - startedAt;
      spinner.succeed(
        `${articles.length} article${articles.length === 1 ? '' : 's'} generated (${(elapsed / 1000).toFixed(1)}s)`
      );

      if (options.json) {
        printJson({ articles: articles.map(toJsonSummary), elapsed });
        return;
      }

      for (const article of articles) {
        printArticle(article);
      }
    } catch (error) {
      handleError(error);
    }
  });

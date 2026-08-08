import { Command } from 'commander';
import ora from 'ora';
import { generateArticle } from '@/api/articles';
import { requireAuth } from '@/api/client';
import { printJson } from '@/ui/theme';
import { handleError } from '@/utils/errors';
import { parseKeywords, printArticle, requireGenerationBrand } from './helpers';

export const articleXCommand = new Command('article-x')
  .description('Generate a long-form X (Twitter) article')
  .argument('<prompt>', 'The prompt describing the article to generate')
  .option('-b, --brand <id>', 'Brand ID (overrides active brand)')
  .option('--keywords <list>', 'Comma-separated keywords to steer the article')
  .option('--tone <tone>', 'Tone of voice for the article')
  .option('--words <n>', 'Target word count (2500-10000)', Number.parseInt)
  .option('--no-header-image', 'Skip generating a header image prompt')
  .option('--json', 'Output as JSON')
  .action(async (prompt, options) => {
    try {
      await requireAuth();

      // `POST /articles/generations` with `type: 'x-article'` runs the full
      // long-form cycle inline and answers with the finished article.
      const brandId = await requireGenerationBrand(options.brand);
      const spinner = ora('Generating X article...').start();
      const startedAt = Date.now();

      const article = await generateArticle({
        brandId,
        generateHeaderImage: options.headerImage,
        keywords: parseKeywords(options.keywords),
        prompt,
        targetWordCount: options.words,
        tone: options.tone,
        type: 'x-article',
      });

      const elapsed = Date.now() - startedAt;
      spinner.succeed(`X article generated (${(elapsed / 1000).toFixed(1)}s)`);

      if (options.json) {
        printJson({
          elapsed,
          id: article.id,
          slug: article.slug,
          status: article.status,
          summary: article.summary,
          title: article.label,
          wordCount: article.xArticleMetadata?.wordCount,
        });
        return;
      }

      printArticle(article);
    } catch (error) {
      handleError(error);
    }
  });

import { IngredientStatus, PersistedArticleStatus } from '@genfeedai/contracts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { getArticle } from '@/api/articles';
import { requireAuth } from '@/api/client';
import { getImage } from '@/api/images';
import { getVideo } from '@/api/videos';
import { formatError, formatLabel, print, printJson } from '@/ui/theme';
import { ApiError, handleError } from '@/utils/errors';

/**
 * Both vocabularies are Prisma-backed, so both arrive SCREAMING_SNAKE and are
 * rendered by their own formatter. Images and videos are ingredients — their
 * success state is `GENERATED`, not a `COMPLETED` that does not exist — while
 * articles carry a publish lifecycle.
 *
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
type Status = IngredientStatus | PersistedArticleStatus;

/** Media is finished and downloadable once the ingredient has an asset. */
const SUCCESS_STATUSES: ReadonlySet<Status> = new Set([
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
]);

/** The generation pipeline is still expected to move these along. */
const IN_PROGRESS_STATUSES: ReadonlySet<Status> = new Set([
  IngredientStatus.DRAFT,
  IngredientStatus.PROCESSING,
]);

interface BaseStatusResult {
  id: string;
  createdAt: string;
}

interface MediaStatusResult extends BaseStatusResult {
  type: 'image' | 'video';
  status: IngredientStatus;
  model: string;
  url?: string;
  error?: string;
  completedAt?: string;
  dimensions?: { width: number; height: number };
  duration?: number;
  resolution?: string;
}

interface ArticleStatusResult extends BaseStatusResult {
  type: 'article';
  status: PersistedArticleStatus;
  title?: string;
  category?: string;
  slug?: string;
}

type StatusResult = MediaStatusResult | ArticleStatusResult;

function formatIngredientStatus(status: IngredientStatus): string {
  switch (status) {
    case IngredientStatus.DRAFT:
      return chalk.yellow('● Pending');
    case IngredientStatus.PROCESSING:
      return chalk.blue('● Processing');
    case IngredientStatus.GENERATED:
    case IngredientStatus.UPLOADED:
    case IngredientStatus.VALIDATED:
      return chalk.green('● Generated');
    case IngredientStatus.ARCHIVED:
      return chalk.dim('● Archived');
    case IngredientStatus.REJECTED:
      return chalk.red('● Rejected');
    case IngredientStatus.FAILED:
      return chalk.red('● Failed');
  }
}

function formatArticleStatus(status: PersistedArticleStatus): string {
  switch (status) {
    case PersistedArticleStatus.DRAFT:
      return chalk.yellow('● Draft');
    case PersistedArticleStatus.PUBLISHED:
      return chalk.green('● Published');
    case PersistedArticleStatus.ARCHIVED:
      return chalk.dim('● Archived');
  }
}

function formatStatus(result: StatusResult): string {
  return result.type === 'article'
    ? formatArticleStatus(result.status)
    : formatIngredientStatus(result.status);
}

export function createStatusCommand(name = 'status'): Command {
  return new Command(name)
    .description('Check the status of a generation job')
    .argument('<id>', 'The ID of the image, video, or article')
    .option('-t, --type <type>', 'Content type (image, video, or article)', 'image')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      try {
        await requireAuth();

        const spinner = ora('Fetching status...').start();

        let result: StatusResult;

        try {
          if (options.type === 'article') {
            const article = await getArticle(id);
            result = {
              category: article.category,
              createdAt: article.createdAt,
              id: article.id,
              // The article serializer exposes no generation model; the headline
              // is `label`, not `title`.
              slug: article.slug,
              status: article.status,
              title: article.label,
              type: 'article',
            };
          } else if (options.type === 'video') {
            const video = await getVideo(id);
            result = {
              completedAt: video.completedAt,
              createdAt: video.createdAt,
              duration: video.duration,
              error: video.error,
              id: video.id,
              model: video.model,
              resolution: video.resolution,
              status: video.status,
              type: 'video',
              url: video.url,
            };
          } else {
            const image = await getImage(id);
            result = {
              completedAt: image.completedAt,
              createdAt: image.createdAt,
              dimensions:
                image.width && image.height
                  ? { height: image.height, width: image.width }
                  : undefined,
              error: image.error,
              id: image.id,
              model: image.model,
              status: image.status,
              type: 'image',
              url: image.url,
            };
          }
        } catch (err) {
          // If image lookup fails, try video (auto-detect type)
          if (options.type === 'image' && err instanceof ApiError && err.statusCode === 404) {
            try {
              const video = await getVideo(id);
              result = {
                completedAt: video.completedAt,
                createdAt: video.createdAt,
                duration: video.duration,
                error: video.error,
                id: video.id,
                model: video.model,
                resolution: video.resolution,
                status: video.status,
                type: 'video',
                url: video.url,
              };
            } catch {
              throw err; // Re-throw original error
            }
          } else {
            throw err;
          }
        }

        spinner.stop();

        if (options.json) {
          printJson(result);
          return;
        }

        print(formatLabel('ID', result.id));
        print(formatLabel('Type', result.type));
        print(formatLabel('Status', formatStatus(result)));

        if (result.type !== 'article') {
          print(formatLabel('Model', result.model));

          if (SUCCESS_STATUSES.has(result.status) && result.url) {
            print(formatLabel('URL', result.url));

            if (result.dimensions) {
              print(
                formatLabel(
                  'Dimensions',
                  `${result.dimensions.width} × ${result.dimensions.height}`
                )
              );
            }

            if (result.duration) {
              print(formatLabel('Duration', `${result.duration}s`));
            }

            if (result.resolution) {
              print(formatLabel('Resolution', result.resolution));
            }

            if (result.completedAt) {
              const completedDate = new Date(result.completedAt);
              print(formatLabel('Completed', completedDate.toLocaleString()));
            }
          }

          if (result.status === IngredientStatus.FAILED && result.error) {
            print();
            print(formatError(`Error: ${result.error}`));
          }
        }

        if (result.type === 'article') {
          if (result.title) {
            print(formatLabel('Title', result.title));
          }
          if (result.category) {
            print(formatLabel('Category', result.category));
          }
          if (result.slug) {
            print(formatLabel('Slug', result.slug));
          }
        }

        if (result.type !== 'article' && IN_PROGRESS_STATUSES.has(result.status)) {
          print();
          print(chalk.dim('Generation is still in progress. Check again later.'));
        }
      } catch (error) {
        handleError(error);
      }
    });
}

export const statusCommand = createStatusCommand();

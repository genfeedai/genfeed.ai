import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { type ArticleStatus, getArticle } from '@/api/articles';
import { requireAuth } from '@/api/client';
import { getImage } from '@/api/images';
import { getVideo } from '@/api/videos';
import { formatError, formatLabel, print, printJson } from '@/ui/theme';
import { ApiError, handleError } from '@/utils/errors';

type ContentType = 'article' | 'image' | 'video';
type MediaStatus = 'pending' | 'processing' | 'completed' | 'failed';
// Articles carry publish-lifecycle statuses (`draft`, `public`, …) rather than
// the media generation statuses, so both vocabularies are rendered here.
type Status = MediaStatus | ArticleStatus;

interface StatusResult {
  id: string;
  type: ContentType;
  status: Status;
  url?: string;
  error?: string;
  model: string;
  createdAt: string;
  completedAt?: string;
  dimensions?: { width: number; height: number };
  duration?: number;
  resolution?: string;
  title?: string;
  category?: string;
  slug?: string;
}

function formatStatus(status: Status): string {
  switch (status) {
    case 'pending':
    case 'draft':
      return chalk.yellow(`● ${status === 'draft' ? 'Draft' : 'Pending'}`);
    case 'processing':
      return chalk.blue('● Processing');
    case 'completed':
    case 'public':
      return chalk.green(`● ${status === 'public' ? 'Public' : 'Completed'}`);
    case 'archived':
      return chalk.dim('● Archived');
    case 'failed':
      return chalk.red('● Failed');
  }
}

export const statusCommand = new Command('status')
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
            model: 'n/a',
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
      print(formatLabel('Status', formatStatus(result.status)));
      if (result.type !== 'article') {
        print(formatLabel('Model', result.model));
      }

      if (result.status === 'completed' && result.url) {
        print(formatLabel('URL', result.url));

        if (result.dimensions) {
          print(
            formatLabel('Dimensions', `${result.dimensions.width} × ${result.dimensions.height}`)
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

      if (result.status === 'failed' && result.error) {
        print();
        print(formatError(`Error: ${result.error}`));
      }

      if (result.status === 'pending' || result.status === 'processing') {
        print();
        print(chalk.dim('Generation is still in progress. Check again later.'));
      }
    } catch (error) {
      handleError(error);
    }
  });

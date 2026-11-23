import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client';
import { deletePost, listPosts } from '@/api/posts';
import {
  formatHeader,
  formatLabel,
  formatSuccess,
  formatWarning,
  print,
  printJson,
} from '@/ui/theme';
import { handleError } from '@/utils/errors';
import { parsePositiveInteger } from '@/utils/options';

export const postsCommand = new Command('posts').description(
  'Manage published and scheduled posts'
);

postsCommand
  .command('list')
  .description('List posts')
  .option('--platform <platform>', 'Filter by platform (twitter, instagram, linkedin, tiktok)')
  .option('--execution-state <state>', 'Filter by execution state (draft, scheduled, published)')
  .option('-l, --limit <n>', 'Max items', parsePositiveInteger, 20)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching posts...').start();
      const posts = await listPosts({
        executionState: options.executionState,
        limit: options.limit,
        platform: options.platform,
      });
      spinner.stop();

      if (posts.length === 0) {
        if (options.json) {
          printJson([]);
          return;
        }
        print(chalk.dim('No posts found.'));
        return;
      }

      if (options.json) {
        printJson(posts);
        return;
      }

      print(formatHeader(`\nPosts (${posts.length}):\n`));

      for (const post of posts) {
        const platform = post.platform ? chalk.blue(`[${post.platform}]`) : '';
        const status = post.status
          ? post.status === 'published'
            ? chalk.green(post.status)
            : post.status === 'scheduled'
              ? chalk.yellow(post.status)
              : chalk.dim(post.status)
          : '';
        const date = post.publishedAt
          ? chalk.dim(new Date(post.publishedAt).toLocaleString())
          : post.scheduledAt
            ? chalk.dim(`scheduled: ${new Date(post.scheduledAt).toLocaleString()}`)
            : '';

        print(`  ${platform} ${status} ${date}`);
        if (post.title) {
          print(`    ${post.title}`);
        }
        print(`    ${chalk.dim(post.id)}`);
        print();
      }
    } catch (error) {
      handleError(error);
    }
  });

postsCommand
  .command('delete')
  .description(
    'Delete a post from Genfeed, published ones included. The copy on the social network is not touched'
  )
  .argument('<id>', 'Post ID')
  .option('--with-media', 'Also delete the Library media only this post uses')
  .option('-f, --force', 'Skip confirmation')
  .option('--json', 'Output as JSON')
  .action(async (id: string, options) => {
    try {
      await requireAuth();

      if (!options.force) {
        const confirmed = await confirm({
          default: false,
          message: options.withMedia
            ? `Delete post ${id} and the Library media only it uses? A published post stays live on its network.`
            : `Delete post ${id}? A published post stays live on its network.`,
        });
        if (!confirmed) {
          print(formatWarning('Delete cancelled'));
          return;
        }
      }

      const spinner = options.json ? undefined : ora('Deleting post...').start();
      try {
        const removal = await deletePost(id, { includeMedia: options.withMedia === true });
        spinner?.stop();

        if (options.json) {
          printJson(removal);
          return;
        }

        print(formatSuccess('Post deleted from Genfeed'));
        print(formatLabel('ID', removal.postId));
        print(formatLabel('Was', removal.previousStatus));
        print(formatLabel('Media deleted', String(removal.media.deleted.length)));
        for (const kept of removal.media.kept) {
          print(formatLabel('Media kept', `${kept.id} (${kept.reason})`));
        }
        if (removal.publishedUrl) {
          print(
            formatWarning(
              `Still live on ${removal.platform ?? 'its network'}: ${removal.publishedUrl}`
            )
          );
        }
        if (!removal.verified.postGone || !removal.verified.mediaGone) {
          print(formatWarning('Read-back failed: the post or its media still resolves'));
        }
      } catch (error) {
        spinner?.fail('Failed to delete post');
        throw error;
      }
    } catch (error) {
      handleError(error);
    }
  });

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client.js';
import { listPosts } from '@/api/posts.js';
import { formatHeader, print, printJson } from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';

export const postsCommand = new Command('posts').description(
  'Manage published and scheduled posts'
);

postsCommand
  .command('list')
  .description('List posts')
  .option('--platform <platform>', 'Filter by platform (twitter, instagram, linkedin, tiktok)')
  .option('--status <status>', 'Filter by status (draft, scheduled, published)')
  .option('-l, --limit <n>', 'Max items', Number.parseInt, 20)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await requireAuth();

      const spinner = ora('Fetching posts...').start();
      const posts = await listPosts({
        limit: options.limit,
        platform: options.platform,
        status: options.status,
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

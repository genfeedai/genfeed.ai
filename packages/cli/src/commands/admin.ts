import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { getOrganizationAppsReport } from '@/api/admin';
import { requireAuth } from '@/api/client';
import { formatHeader, formatLabel, print, printJson } from '@/ui/theme';
import { handleError } from '@/utils/errors';
import { wantsJson } from '@/utils/options';

export const adminCommand = new Command('admin').description(
  'Platform admin reports (super admin only)'
);

adminCommand
  .command('org-apps')
  .description('List the apps each organization sees, with release flags')
  .option('--json', 'Output as JSON')
  .action(async (_options, command: Command) => {
    try {
      await requireAuth();

      const spinner = wantsJson(command) ? undefined : ora('Fetching organization apps...').start();
      const report = await getOrganizationAppsReport();
      spinner?.stop();

      if (wantsJson(command)) {
        printJson(report);
        return;
      }

      const releasedFlags = Object.entries(report.releaseFlags)
        .filter(([, isReleased]) => isReleased)
        .map(([flag]) => flag);
      print(formatHeader(`${report.organizations.length} organizations\n`));
      print(
        `${formatLabel(
          'Released for everyone',
          releasedFlags.length > 0 ? releasedFlags.join(', ') : chalk.dim('none')
        )}\n`
      );

      for (const organization of report.organizations) {
        const visibleApps = Object.entries(organization.apps)
          .filter(([, app]) => app.isVisible)
          .map(([appId]) => appId);
        const tier = organization.subscriptionTier ?? 'no tier';
        const preview = organization.isReleasePreviewEnabled ? ' (release preview)' : '';
        print(
          `${chalk.bold(organization.label)} ${chalk.dim(`${organization.slug} · ${tier}${preview}`)}`
        );
        print(`  ${visibleApps.length > 0 ? visibleApps.join(', ') : chalk.dim('no apps')}`);
      }
    } catch (error) {
      handleError(error);
    }
  });

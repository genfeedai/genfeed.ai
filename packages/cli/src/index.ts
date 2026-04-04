#!/usr/bin/env node
import chalk from 'chalk';
import { Command } from 'commander';
import { batchCommand } from './commands/batch.js';
import { brandsCommand } from './commands/brands.js';
import { captionCommand } from './commands/caption.js';
import { chatCommand } from './commands/chat.js';
import { configCommand } from './commands/config.js';
import { creditsCommand } from './commands/credits.js';
import { darkroomCommand } from './commands/darkroom.js';
import { datasetCommand } from './commands/dataset.js';
import { generateCommand } from './commands/generate/index.js';
import { insightsCommand } from './commands/insights.js';
import { libraryCommand } from './commands/library.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { performanceCommand } from './commands/performance.js';
import { personasCommand } from './commands/personas.js';
import { postsCommand } from './commands/posts.js';
import { profileCommand } from './commands/profile.js';
import { publishCommand } from './commands/publish.js';
import { scheduleCommand } from './commands/schedule.js';
import { statusCommand } from './commands/status.js';
import { templateCommand } from './commands/template.js';
import { threadsCommand } from './commands/threads.js';
import { toolsCommand } from './commands/tools.js';
import { trainCommand } from './commands/train.js';
import { whoamiCommand } from './commands/whoami.js';
import { workflowCommand } from './commands/workflow.js';
import { getRole } from './config/store.js';
import { runAgentShell } from './shell/agent-shell.js';
import { formatError, formatHeader, print } from './ui/theme.js';

const BANNER = chalk.hex('#7C3AED').bold(`
     ██████  ███████
    ██       ██
    ██   ███ █████
    ██    ██ ██
     ██████  ██
`);

const program = new Command();

program
  .name('gf')
  .description('Unified CLI for Genfeed.ai')
  .version('0.4.0')
  .addCommand(loginCommand)
  .addCommand(logoutCommand)
  .addCommand(whoamiCommand)
  .addCommand(brandsCommand)
  .addCommand(generateCommand)
  .addCommand(statusCommand)
  .addCommand(chatCommand)
  .addCommand(threadsCommand)
  .addCommand(workflowCommand)
  .addCommand(publishCommand)
  .addCommand(libraryCommand)
  .addCommand(profileCommand)
  .addCommand(batchCommand)
  .addCommand(templateCommand)
  .addCommand(creditsCommand)
  .addCommand(insightsCommand)
  .addCommand(scheduleCommand)
  .addCommand(performanceCommand)
  .addCommand(postsCommand)
  .addCommand(configCommand)
  .addCommand(toolsCommand);

program
  .addCommand(darkroomCommand)
  .addCommand(trainCommand)
  .addCommand(personasCommand)
  .addCommand(captionCommand)
  .addCommand(datasetCommand);

program.exitOverride();

async function printBanner(): Promise<void> {
  print(BANNER);
  print(chalk.dim('  Unified CLI for Genfeed.ai'));

  const role = await getRole();
  if (role === 'admin') {
    print(chalk.dim('  Mode: ') + chalk.green('admin'));
  }
  print();
}

async function printHelp(): Promise<void> {
  const role = await getRole();

  print(formatHeader('User Commands:\n'));
  print('  login          Authenticate with your Genfeed API key');
  print('  logout         Remove stored credentials');
  print('  whoami         Show current user and organization');
  print('  brands         Manage brands');
  print('  generate       Generate AI content (image, video, article)');
  print('  status         Check the status of a generation job');
  print('  chat           Start the interactive agent shell');
  print('  threads        List, inspect, archive, and resume agent threads');
  print('  workflow       Manage and execute workflows');
  print('  publish        Publish content to social media');
  print('  library        Browse content library');
  print('  profile        Manage CLI profiles');
  print('  batch          Batch content generation');
  print('  template       Manage content templates');
  print('  credits        View credit usage and billing');
  print('  insights       AI-powered content insights');
  print('  schedule       Content scheduling and calendar');
  print('  performance    Content performance analytics');
  print('  posts          Manage published and scheduled posts');
  print('  config         Manage CLI configuration');
  print('  tools          List canonical agent tools available in the CLI shell');

  if (role === 'admin') {
    print();
    print(formatHeader('Admin Commands:\n'));
    print('  darkroom       Darkroom infrastructure (health, comfy, loras)');
    print('  train          LoRA training (start, status)');
    print('  personas       List and manage personas');
    print('  caption        Run Florence-2 auto-captioning');
    print('  dataset        Manage training datasets');
  }

  print();
  print(chalk.dim('  Run `gf <command> --help` for command details'));
  print(chalk.dim('  Run `gf` with no args for the interactive agent shell'));
}

async function startRepl(): Promise<void> {
  await printBanner();
  await printHelp();
  print();
  await runAgentShell();
}

if (process.argv.length <= 2) {
  startRepl().catch((error) => {
    console.error(formatError(`Fatal: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  });
} else {
  program.parseAsync().catch((error) => {
    if (error instanceof Error && 'code' in error) {
      const code = (error as { code: string }).code;
      if (code === 'commander.helpDisplayed' || code === 'commander.version') {
        process.exit(0);
      }
    }

    console.error(formatError(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}

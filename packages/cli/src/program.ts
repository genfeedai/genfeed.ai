import { Command } from 'commander';
import { authCommand } from '@/commands/auth';
import { balanceCommand } from '@/commands/balance';
import { batchCommand } from '@/commands/batch';
import { brandsCommand } from '@/commands/brands';
import { chatCommand } from '@/commands/chat';
import { configCommand } from '@/commands/config';
import { creditsCommand } from '@/commands/credits';
import { generateCommand } from '@/commands/generate/index';
import { insightsCommand } from '@/commands/insights';
import { jobCommand } from '@/commands/job';
import { keysCommand } from '@/commands/keys';
import { libraryCommand } from '@/commands/library';
import { loginCommand } from '@/commands/login';
import { logoutCommand } from '@/commands/logout';
import { organizationsCommand } from '@/commands/organizations';
import { performanceCommand } from '@/commands/performance';
import { postsCommand } from '@/commands/posts';
import { profileCommand } from '@/commands/profile';
import { publishCommand } from '@/commands/publish';
import { scheduleCommand } from '@/commands/schedule';
import { signupCommand } from '@/commands/signup';
import { statusCommand } from '@/commands/status';
import { templateCommand } from '@/commands/template';
import { threadsCommand } from '@/commands/threads';
import { toolsCommand } from '@/commands/tools';
import { whoamiCommand } from '@/commands/whoami';
import { workflowCommand } from '@/commands/workflow';

export type LaunchMode = 'command' | 'help' | 'tui';

export interface LaunchModeInput {
  hasArguments: boolean;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
}

export function resolveLaunchMode(input: LaunchModeInput): LaunchMode {
  if (input.hasArguments) {
    return 'command';
  }

  return input.stdinIsTTY && input.stdoutIsTTY ? 'tui' : 'help';
}

export function createProgram(): Command {
  return new Command()
    .name('gf')
    .description('The Genfeed terminal content workspace')
    .version('0.6.0')
    .addCommand(authCommand)
    .addCommand(loginCommand)
    .addCommand(signupCommand)
    .addCommand(logoutCommand)
    .addCommand(whoamiCommand)
    .addCommand(keysCommand)
    .addCommand(organizationsCommand)
    .addCommand(brandsCommand)
    .addCommand(generateCommand)
    .addCommand(balanceCommand)
    .addCommand(creditsCommand)
    .addCommand(statusCommand)
    .addCommand(jobCommand)
    .addCommand(chatCommand)
    .addCommand(threadsCommand)
    .addCommand(workflowCommand)
    .addCommand(publishCommand)
    .addCommand(libraryCommand)
    .addCommand(profileCommand)
    .addCommand(batchCommand)
    .addCommand(templateCommand)
    .addCommand(insightsCommand)
    .addCommand(scheduleCommand)
    .addCommand(performanceCommand)
    .addCommand(postsCommand)
    .addCommand(configCommand)
    .addCommand(toolsCommand);
}

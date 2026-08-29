import { Command } from 'commander';
import { createStatusCommand } from '@/commands/status';

export const jobCommand = new Command('job')
  .description('Inspect generation jobs')
  .addCommand(createStatusCommand('status'));

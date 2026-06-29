import { Command } from 'commander';
import { createLoginCommand } from '@/commands/login';

export const authCommand = new Command('auth')
  .description('Authenticate and manage Genfeed CLI access')
  .addCommand(createLoginCommand('login'));

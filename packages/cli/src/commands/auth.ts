import { Command } from 'commander';
import { createAuthStatusCommand } from '@/commands/auth-status';
import { createLoginCommand } from '@/commands/login';
import { createAuthLogoutCommand } from '@/commands/logout';

export const authCommand = new Command('auth')
  .description('Authenticate and manage Genfeed CLI access')
  .addCommand(createLoginCommand('login'))
  .addCommand(createAuthStatusCommand())
  .addCommand(createAuthLogoutCommand());

import { Command } from 'commander';
import { clearActiveBrand, clearApiKey, getApiKey } from '@/config/store';
import { formatSuccess, formatWarning, print } from '@/ui/theme';
import { handleError } from '@/utils/errors';

export async function runLogout(): Promise<void> {
  try {
    const hasKey = await getApiKey();

    if (!hasKey) {
      print(formatWarning('You are not logged in'));
      return;
    }

    await clearApiKey();
    await clearActiveBrand();

    print(formatSuccess('Logged out successfully'));
  } catch (error) {
    handleError(error);
  }
}

export const logoutCommand = new Command('logout')
  .description('Remove stored credentials')
  .action(runLogout);

export function createAuthLogoutCommand(): Command {
  return new Command('logout').description('Remove stored credentials').action(runLogout);
}

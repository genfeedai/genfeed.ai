import { Command } from 'commander';
import { clearActiveBrand, clearApiKey, getApiKey } from '@/config/store.js';
import { formatSuccess, formatWarning, print } from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';

export const logoutCommand = new Command('logout')
  .description('Remove stored credentials')
  .action(async () => {
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
  });

import type { ISetting } from '@genfeedai/contracts/interfaces';
import { UsersService } from '@services/organization/users.service';
import type { QueryClient } from '@tanstack/react-query';

/**
 * The signed-in user's settings row (`GET me/settings`), cached once for every
 * surface that reads it: the rail preferences and the workflow library's
 * favorites. `useAuthedQuery` appends the viewer.
 */
export const ME_SETTINGS_QUERY_KEY = ['me-settings'] as const;

export function createUsersService(token: string): UsersService {
  return UsersService.getInstance(token);
}

/**
 * Writes a saved settings change into the cache. A read still in flight began
 * before the save, so it is dropped first and cannot put the old value back.
 */
export async function writeMeSettings(
  queryClient: QueryClient,
  update: Partial<ISetting>,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey: ME_SETTINGS_QUERY_KEY });
  queryClient.setQueriesData<ISetting>(
    { queryKey: ME_SETTINGS_QUERY_KEY },
    (current) => (current ? { ...current, ...update } : current),
  );
}

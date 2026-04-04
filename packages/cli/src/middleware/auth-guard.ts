import { requireAuth } from '@/api/client.js';
import { getRole } from '@/config/store.js';
import { AdminRequiredError } from '@/utils/errors.js';

/**
 * Wraps a Commander action handler to require admin role.
 * If the user doesn't have admin role, throws AdminRequiredError.
 */
export function requireAdmin<T extends (...args: never[]) => Promise<void>>(action: T): T {
  return (async (...args: Parameters<T>) => {
    await requireAuth();
    const role = await getRole();
    if (role !== 'admin') {
      throw new AdminRequiredError();
    }
    return action(...args);
  }) as T;
}

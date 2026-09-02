import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import type { ReleaseGroupsService } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import type { NotificationsService } from '@services/core/notifications.service';

export type RunReleaseMutation = (
  action: string,
  mutation: (service: ReleaseGroupsService) => Promise<IReleaseGroup>,
  onFailure?: () => void,
) => Promise<void>;

export interface ReleaseMutationRunnerDeps {
  getReleaseGroupsService: () => Promise<ReleaseGroupsService>;
  notificationsService: NotificationsService;
  onSuccess: (updated: IReleaseGroup) => void;
  setDrawerError?: (message: string | null) => void;
  setPendingAction: (action: string | null) => void;
}

export function mutationErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The schedule change could not be saved.';
}

/**
 * Every schedule mutation shares one path: apply the server's response, or
 * surface the failure through notifications and (when the caller keeps an
 * inline alert) `setDrawerError`. Shared by the calendar page's local-state
 * release list and the rail list's react-query cache — `onSuccess` is the
 * only piece that differs between the two.
 */
export function createReleaseMutationRunner(
  deps: ReleaseMutationRunnerDeps,
): RunReleaseMutation {
  return async (action, mutation, onFailure) => {
    deps.setPendingAction(action);
    deps.setDrawerError?.(null);

    try {
      const service = await deps.getReleaseGroupsService();
      const updated = await mutation(service);
      deps.onSuccess(updated);
    } catch (error) {
      onFailure?.();
      const message = mutationErrorMessage(error);
      logger.error('Failed to update release schedule', error);
      deps.setDrawerError?.(message);
      deps.notificationsService.error(message);
    } finally {
      deps.setPendingAction(null);
    }
  };
}

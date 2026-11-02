import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useCallback, useRef } from 'react';

interface InlineRecordSaveOptions<TPatch> {
  /** Shown when the save fails; the field reverts to its saved value. */
  errorMessage: string;
  /** Reloads the list so the sidebar and table show the saved record. */
  onSaved: () => Promise<unknown> | unknown;
  /** Sends the partial update for one record. */
  save: (id: string, patch: TPatch) => Promise<unknown>;
}

/**
 * Saves one edited field of a record from the context sidebar. Failures notify
 * and rethrow so the inline field reverts; success refreshes the list without a
 * toast (a visible change is its own confirmation).
 */
export function useInlineRecordSave<TPatch>({
  errorMessage,
  onSaved,
  save,
}: InlineRecordSaveOptions<TPatch>): (
  id: string,
  patch: TPatch,
) => Promise<void> {
  const optionsRef = useRef({ errorMessage, onSaved, save });
  optionsRef.current = { errorMessage, onSaved, save };

  return useCallback(async (id: string, patch: TPatch) => {
    const {
      errorMessage: message,
      onSaved: refresh,
      save: send,
    } = optionsRef.current;

    try {
      await send(id, patch);
    } catch (error) {
      logger.error(`PATCH /${id} failed`, error);
      NotificationsService.getInstance().error(message);
      throw error;
    }

    await refresh();
  }, []);
}

import {
  CalendarSlotState,
  formatPlatformLabel,
  parsePlatform,
} from '@genfeedai/contracts';
import type {
  CalendarEventAction,
  CalendarEventBadge,
  CalendarEventChannel,
} from '@props/components/calendar.props';
import type { CalendarEventPresentationOptions } from '@props/publishing/content-calendar-controller.props';
import type { ContentCalendarItem } from '@props/publishing/content-calendar-page.props';
import { useCallback } from 'react';
import {
  isReleaseDraggable,
  releaseStatusBadge,
  releaseTargets,
} from '@/features/posts/shared/release-status.helpers';
import {
  CALENDAR_SLOT_EVENT_COLOR,
  getContentCalendarEventColor,
} from './calendar-item-color.helper';

export function useCalendarEventPresentation({
  translate,
  generateSlotByIdentity,
}: CalendarEventPresentationOptions) {
  const getEventColor = useCallback((item: ContentCalendarItem) => {
    if (item.itemType === 'day-aggregate' || item.itemType === 'newsletter') {
      return CALENDAR_SLOT_EVENT_COLOR;
    }

    return getContentCalendarEventColor(item);
  }, []);

  const getEventBadge = useCallback(
    (item: ContentCalendarItem): CalendarEventBadge | null => {
      if (item.itemType === 'release') {
        return releaseStatusBadge(item.release);
      }
      if (item.itemType === 'day-aggregate') {
        return {
          label: translate('monthDaySummary', {
            filled: item.filledCount,
            missing: item.missingCount,
          }),
          tone: 'muted',
        };
      }
      if (item.itemType !== 'slot') {
        return null;
      }
      return {
        label:
          item.slot.state === CalendarSlotState.GENERATE_FAILED
            ? 'failed'
            : item.slot.state === CalendarSlotState.GENERATING
              ? 'generating'
              : 'missing',
        tone:
          item.slot.state === CalendarSlotState.GENERATE_FAILED
            ? 'danger'
            : item.slot.state === CalendarSlotState.GENERATING
              ? 'warning'
              : 'muted',
      };
    },
    [translate],
  );

  const getEventActions = useCallback(
    (item: ContentCalendarItem): CalendarEventAction[] => {
      if (
        item.itemType !== 'slot' ||
        item.slot.state !== CalendarSlotState.MISSING
      ) {
        return [];
      }
      return [
        {
          id: 'generate',
          label: translate('generate'),
          onClick: () => {
            void generateSlotByIdentity(item.slot.identityKey);
          },
        },
      ];
    },
    [generateSlotByIdentity, translate],
  );

  /**
   * One icon per distinct platform: a release with two Instagram accounts still
   * reads as one Instagram destination on a dense week cell.
   */
  const getEventChannels = useCallback(
    (item: ContentCalendarItem): CalendarEventChannel[] => {
      if (item.itemType !== 'release') {
        return [];
      }

      const seen = new Map<string, CalendarEventChannel>();
      for (const target of releaseTargets(item.release)) {
        const platformId = parsePlatform(target.platform) ?? target.platform;
        if (!seen.has(platformId)) {
          seen.set(platformId, {
            id: platformId,
            label: formatPlatformLabel(target.platform) ?? target.platform,
          });
        }
      }

      return [...seen.values()];
    },
    [],
  );

  const isItemDraggable = useCallback(
    (item: ContentCalendarItem): boolean =>
      item.itemType === 'release' && isReleaseDraggable(item.release),
    [],
  );

  return {
    getEventColor,
    getEventBadge,
    getEventActions,
    getEventChannels,
    isItemDraggable,
  };
}

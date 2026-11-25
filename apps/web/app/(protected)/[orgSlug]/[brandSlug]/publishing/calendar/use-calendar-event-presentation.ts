import {
  CalendarSlotState,
  formatPlatformLabel,
  parsePlatform,
  ReleaseStatus,
} from '@genfeedai/contracts';
import {
  PLATFORM_COLORS,
  type PlatformId,
} from '@genfeedai/contracts/constants';
import { toConnectedAccount } from '@genfeedai/helpers/publisher/connected-account.helper';
import { useCallback } from 'react';
import type { CalendarEventPresentationOptions } from '@/features/posts/props/content-calendar-controller.props';
import type { ContentCalendarItem } from '@/features/posts/props/content-calendar-page.props';
import {
  isReleaseDraggable,
  releaseStatusBadge,
  releaseTargets,
} from '@/features/posts/shared/release-status.helpers';
import type {
  CalendarEventAccount,
  CalendarEventAction,
  CalendarEventBadge,
  CalendarEventChannel,
} from '@/props/components/calendar.props';
import {
  CALENDAR_DEFAULT_EVENT_COLOR,
  CALENDAR_SLOT_EVENT_COLOR,
  getContentCalendarEventColor,
} from './calendar-item-color.helper';

export function useCalendarEventPresentation({
  credentials,
  translate,
  generateSlotByIdentity,
}: CalendarEventPresentationOptions) {
  const getEventColor = useCallback((item: ContentCalendarItem) => {
    if (item.itemType === 'day-aggregate' || item.itemType === 'newsletter') {
      return CALENDAR_SLOT_EVENT_COLOR;
    }

    const tagged = getContentCalendarEventColor(item);
    if (
      item.itemType !== 'release' ||
      tagged !== CALENDAR_DEFAULT_EVENT_COLOR
    ) {
      return tagged;
    }

    // An untagged post wears the colour of the platform it goes to.
    const firstTarget = releaseTargets(item.release)[0];
    const platformId = firstTarget
      ? (parsePlatform(firstTarget.platform) ?? firstTarget.platform)
      : null;
    return (
      (platformId && PLATFORM_COLORS[platformId as PlatformId]?.base) ||
      CALENDAR_DEFAULT_EVENT_COLOR
    );
  }, []);

  const getEventBadge = useCallback(
    (item: ContentCalendarItem): CalendarEventBadge | null => {
      if (item.itemType === 'release') {
        // "Scheduled" is the normal state and says nothing a glance at the
        // time does not; only what needs attention gets a badge.
        return item.release.status === ReleaseStatus.SCHEDULED
          ? null
          : releaseStatusBadge(item.release);
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

  /**
   * The profile pictures a release goes to, one per connected account. A
   * target the brand no longer has a credential for still shows its platform.
   */
  const getEventAccounts = useCallback(
    (item: ContentCalendarItem): CalendarEventAccount[] => {
      if (item.itemType !== 'release') {
        return [];
      }

      const accounts = new Map<string, CalendarEventAccount>();
      for (const target of releaseTargets(item.release)) {
        const credential =
          target.credential ??
          credentials.find((entry) => entry.id === target.credentialId);
        const key = target.credentialId ?? target.platform;
        if (!accounts.has(key)) {
          accounts.set(key, {
            ...(credential
              ? toConnectedAccount(credential)
              : { platform: target.platform }),
            id: key,
          });
        }
      }

      return [...accounts.values()];
    },
    [credentials],
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
    getEventAccounts,
    getEventChannels,
    isItemDraggable,
  };
}

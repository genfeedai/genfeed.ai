import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { type ReactElement, useCallback, useState } from 'react';
import {
  HiCalendarDays,
  HiCheck,
  HiClock,
  HiCurrencyDollar,
} from 'react-icons/hi2';

interface SchedulePostCardProps {
  action: AgentUiAction;
  onSchedule?: (payload: { scheduledAt: string; platforms: string[] }) => void;
}

const AVAILABLE_PLATFORMS = [
  'twitter',
  'instagram',
  'linkedin',
  'tiktok',
  'facebook',
];

export function SchedulePostCard({
  action,
  onSchedule,
}: SchedulePostCardProps): ReactElement {
  const suggestedPlatforms = action.platforms ?? [];
  const [dateTime, setDateTime] = useState(action.scheduledAt ?? '');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set(suggestedPlatforms),
  );
  const [isScheduled, setIsScheduled] = useState(false);

  const togglePlatform = useCallback((platform: string) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  }, []);

  const handleSchedule = useCallback(() => {
    if (!dateTime || selectedPlatforms.size === 0) {
      return;
    }
    onSchedule?.({
      platforms: Array.from(selectedPlatforms),
      scheduledAt: dateTime,
    });
    setIsScheduled(true);
  }, [dateTime, selectedPlatforms, onSchedule]);

  if (isScheduled) {
    return (
      <div className="my-2 border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <HiCheck className="h-5 w-5" />
          <span className="text-sm font-medium">
            Post scheduled for {selectedPlatforms.size} platform
            {selectedPlatforms.size !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiCalendarDays className="h-5 w-5 text-blue-500" />
        <h3 className="text-sm font-semibold">
          {action.title || 'Schedule Post'}
        </h3>
      </div>

      {action.description && (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      )}

      {/* Date/Time input */}
      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <HiClock className="mr-1 inline h-3 w-3" />
          Date & Time
        </label>
        <Input
          type="datetime-local"
          value={dateTime}
          onChange={(e) => setDateTime(e.target.value)}
        />
      </div>

      {/* Platform checkboxes */}
      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Platforms
        </label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_PLATFORMS.map((platform) => (
            <label
              key={platform}
              className={`flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 text-xs transition-colors ${
                selectedPlatforms.has(platform)
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              <Input
                type="checkbox"
                isChecked={selectedPlatforms.has(platform)}
                onChange={() => togglePlatform(platform)}
                className="sr-only"
              />
              {platform.charAt(0).toUpperCase() + platform.slice(1)}
            </label>
          ))}
        </div>
      </div>

      {/* Credit estimate */}
      {action.creditEstimate != null && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <HiCurrencyDollar className="h-3.5 w-3.5" />
          <span>Estimated cost: {action.creditEstimate} credits</span>
        </div>
      )}

      {/* Schedule button */}
      <Button
        variant={ButtonVariant.DEFAULT}
        onClick={handleSchedule}
        isDisabled={!dateTime || selectedPlatforms.size === 0}
        icon={<HiCalendarDays className="h-4 w-4" />}
        className="w-full justify-center"
      >
        Schedule
      </Button>
    </div>
  );
}

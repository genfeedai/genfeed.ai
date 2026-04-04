import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import {
  type ChangeEvent,
  type ReactElement,
  useCallback,
  useState,
} from 'react';
import {
  HiCalendarDays,
  HiCheckCircle,
  HiPaperAirplane,
} from 'react-icons/hi2';

interface PublishPostCardProps {
  action: AgentUiAction;
  onUiAction?: (
    action: string,
    payload?: Record<string, unknown>,
  ) => void | Promise<void>;
}

export function PublishPostCard({
  action,
  onUiAction,
}: PublishPostCardProps): ReactElement {
  const availablePlatforms = Array.isArray(action.data?.availablePlatforms)
    ? (action.data.availablePlatforms as string[])
    : (action.platforms ?? []);
  const initialPlatforms =
    action.platforms && action.platforms.length > 0
      ? action.platforms.filter((platform) =>
          availablePlatforms.includes(platform),
        )
      : availablePlatforms;

  const [caption, setCaption] = useState(action.textContent ?? '');
  const [scheduledAt, setScheduledAt] = useState(action.scheduledAt ?? '');
  const [selectedPlatforms, setSelectedPlatforms] =
    useState<string[]>(initialPlatforms);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const togglePlatform = useCallback((platform: string) => {
    setSelectedPlatforms((current) =>
      current.includes(platform)
        ? current.filter((value) => value !== platform)
        : [...current, platform],
    );
  }, []);

  const handleCaptionChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setCaption(event.target.value);
    },
    [],
  );

  const handleScheduleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setScheduledAt(event.target.value);
    },
    [],
  );

  const handleConfirm = useCallback(async () => {
    if (
      !onUiAction ||
      !action.contentId ||
      selectedPlatforms.length === 0 ||
      isSubmitting ||
      isSubmitted
    ) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onUiAction('confirm_publish_post', {
        caption: caption.trim() || undefined,
        contentId: action.contentId,
        platforms: selectedPlatforms,
        scheduledAt: scheduledAt.trim() || undefined,
        sourceActionId: action.id,
      });
      setIsSubmitted(true);
    } catch {
      // The chat container surfaces action failures.
    } finally {
      setIsSubmitting(false);
    }
  }, [
    action.contentId,
    action.id,
    caption,
    isSubmitted,
    isSubmitting,
    onUiAction,
    scheduledAt,
    selectedPlatforms,
  ]);

  if (isSubmitted) {
    return (
      <div className="my-2 rounded-lg border border-emerald-500/20 bg-background p-4">
        <div className="flex items-center gap-2 text-emerald-600">
          <HiCheckCircle className="h-5 w-5" />
          <span className="text-sm font-medium">
            {scheduledAt
              ? 'Publish scheduled from chat.'
              : 'Publish confirmed from chat.'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiPaperAirplane className="h-5 w-5 text-emerald-500" />
        <h3 className="text-sm font-semibold text-foreground">
          {action.title || 'Publish selected content'}
        </h3>
      </div>

      {action.description ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      ) : null}

      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Caption
        </label>
        <textarea
          value={caption}
          onChange={handleCaptionChange}
          rows={4}
          className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Optional caption override"
        />
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Platforms
        </label>
        <div className="flex flex-wrap gap-2">
          {availablePlatforms.map((platform) => {
            const selected = selectedPlatforms.includes(platform);

            return (
              <button
                key={platform}
                type="button"
                onClick={() => togglePlatform(platform)}
                className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                  selected
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                {platform}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          <HiCalendarDays className="mr-1 inline h-3 w-3" />
          Schedule for later
        </label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={handleScheduleChange}
          className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <button
        type="button"
        onClick={() => {
          void handleConfirm();
        }}
        disabled={
          !action.contentId || selectedPlatforms.length === 0 || isSubmitting
        }
        className="flex w-full items-center justify-center gap-2 rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <HiPaperAirplane className="h-4 w-4" />
        {isSubmitting
          ? 'Publishing...'
          : scheduledAt
            ? 'Confirm schedule'
            : 'Confirm publish'}
      </button>
    </div>
  );
}

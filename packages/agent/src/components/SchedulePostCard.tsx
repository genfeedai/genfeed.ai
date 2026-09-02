import type {
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/contracts';
import {
  fromDateTimeLocalInput,
  getBrowserTimezone,
  TIMEZONES,
  toDateTimeLocalInput,
} from '@genfeedai/helpers/formatting/timezone/timezone.helper';
import { usePostingSets } from '@hooks/data/content/use-posting-sets/use-posting-sets';
import { usePostingSignatures } from '@hooks/data/content/use-posting-signatures/use-posting-signatures';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import PostingSetPicker from '@ui/publisher/PostingSetPicker';
import PostingSignaturePicker from '@ui/publisher/PostingSignaturePicker';
import { Calendar, Check, Clock, DollarSign } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useCallback, useMemo, useState } from 'react';
import {
  readPublishTargetProposals,
  resolveLiveTargetBlockers,
  targetToggleName,
} from './publish-post-card.helpers';
import {
  buildSignatureAttachments,
  isHealthyReferenceState,
  postingSetTargetsFromSelection,
  readActionTimezone,
  readAvailablePlatforms,
} from './schedule-post-card.helpers';

interface SchedulePostCardProps {
  action: AgentUiAction;
  onSchedule?: (payload: {
    platforms: string[];
    postingSetId?: string;
    scheduledAt: string;
    targets?: Array<{
      attachments?: Array<{
        body: string;
        kind: string;
        order?: number;
        platform?: string;
      }>;
      credentialId: string;
      platform: string;
      scheduledAt?: string;
      signatureIds?: string[];
      timezone?: string;
    }>;
    timezone: string;
  }) => void;
  onUiAction?: AgentUiActionHandler;
}

export function SchedulePostCard({
  action,
  onSchedule,
  onUiAction,
}: SchedulePostCardProps): ReactElement {
  const translate = useTranslations('agent.schedulePostCard');
  const postingSetsTranslate = useTranslations('agent.postingSets');
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const targetProposals = useMemo(
    () => readPublishTargetProposals(action.targets),
    [action.targets],
  );
  const availablePlatforms = useMemo(
    () =>
      readAvailablePlatforms(action.data?.availablePlatforms, action.platforms),
    [action.data?.availablePlatforms, action.platforms],
  );
  const [timezone, setTimezone] = useState(() =>
    readActionTimezone(action.data?.timezone, browserTimezone),
  );
  const [dateTime, setDateTime] = useState(() =>
    toDateTimeLocalInput(action.scheduledAt, timezone),
  );
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    () => new Set(action.platforms ?? availablePlatforms),
  );
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>(() =>
    targetProposals
      .filter((target) => target.isSelected !== false)
      .map((target) => target.id),
  );
  const [scheduledAtByTarget, setScheduledAtByTarget] = useState<
    Record<string, string>
  >(() => {
    const initial: Record<string, string> = {};
    for (const target of targetProposals) {
      if (target.scheduledAt) {
        initial[target.id] = toDateTimeLocalInput(target.scheduledAt, timezone);
      }
    }
    return initial;
  });
  const [signatureIdsByTarget, setSignatureIdsByTarget] = useState<
    Record<string, string[]>
  >(() => {
    const initial: Record<string, string[]> = {};
    for (const target of targetProposals) {
      if (target.signatureIds && target.signatureIds.length > 0) {
        initial[target.id] = target.signatureIds;
      }
    }
    return initial;
  });
  const [selectedSetId, setSelectedSetId] = useState<string | undefined>();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    createSet,
    expandError,
    expandSet,
    isExpanding,
    isSaving,
    saveError,
    sets,
  } = usePostingSets();
  const { signatures } = usePostingSignatures();
  const selectedTargetIdSet = useMemo(
    () => new Set(selectedTargetIds),
    [selectedTargetIds],
  );
  const selectedTargets = useMemo(
    () =>
      targetProposals.filter((target) => selectedTargetIdSet.has(target.id)),
    [selectedTargetIdSet, targetProposals],
  );
  const publishMode = dateTime.trim() ? 'scheduled' : 'publish_now';
  const targetBlockers = useMemo(() => {
    const blockersById: Record<
      string,
      ReturnType<typeof resolveLiveTargetBlockers>
    > = {};
    for (const target of selectedTargets) {
      blockersById[target.id] = resolveLiveTargetBlockers({
        caption: target.caption,
        credentialId: target.credentialId,
        media: target.media,
        platform: target.platform,
        publishMode,
        settings: target.settings,
        visibility: target.visibility,
      });
    }
    return blockersById;
  }, [publishMode, selectedTargets]);
  const hasSelectedTargetBlockers = selectedTargets.some(
    (target) => (targetBlockers[target.id] ?? []).length > 0,
  );
  const hasUnhealthySelectedTarget = selectedTargets.some(
    (target) => !isHealthyReferenceState(target.referenceState),
  );

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

  const toggleTarget = useCallback((targetId: string) => {
    setSelectedTargetIds((current) => {
      const next = new Set(current);
      if (next.has(targetId)) {
        next.delete(targetId);
      } else {
        next.add(targetId);
      }
      return [...next];
    });
  }, []);

  const handleSelectSet = useCallback(
    async (id: string) => {
      setSelectedSetId(id);
      const expanded = await expandSet(id, {
        ...(action.scheduledAt ? { scheduledDate: action.scheduledAt } : {}),
        timezone,
      });
      const expandedIds = new Set(
        expanded.map((target) => target.credentialId),
      );
      setSelectedTargetIds(
        targetProposals
          .filter((target) => expandedIds.has(target.credentialId))
          .map((target) => target.id),
      );
      if (availablePlatforms.length > 0) {
        setSelectedPlatforms(
          new Set(
            expanded
              .map((target) => target.platform)
              .filter((platform) => availablePlatforms.includes(platform)),
          ),
        );
      }
    },
    [
      action.scheduledAt,
      availablePlatforms,
      expandSet,
      targetProposals,
      timezone,
    ],
  );

  const handleSaveCurrent = useCallback(
    async (label: string) => {
      const targets =
        selectedTargets.length > 0
          ? selectedTargets
          : availablePlatforms
              .filter((platform) => selectedPlatforms.has(platform))
              .map((platform) => ({
                credentialId: platform,
                platform,
                signatureIds: undefined,
                timezone,
              }));
      if (targets.length === 0) {
        return;
      }
      await createSet({
        label,
        targets: postingSetTargetsFromSelection({ targets }),
      });
    },
    [
      availablePlatforms,
      createSet,
      selectedPlatforms,
      selectedTargets,
      timezone,
    ],
  );

  const handleSchedule = useCallback(async () => {
    const isoScheduledAt = dateTime
      ? fromDateTimeLocalInput(dateTime, timezone)
      : null;
    const hasStructuredTargets = targetProposals.length > 0;
    const platforms = hasStructuredTargets
      ? Array.from(new Set(selectedTargets.map((target) => target.platform)))
      : Array.from(selectedPlatforms);

    if (
      !isoScheduledAt ||
      platforms.length === 0 ||
      (hasStructuredTargets &&
        (selectedTargets.length === 0 || hasSelectedTargetBlockers))
    ) {
      setValidationError(translate('validationRequired'));
      return;
    }

    setValidationError(null);
    const payloadTargets = selectedTargets.map((target) => {
      const signatureIds = signatureIdsByTarget[target.id] ?? [];
      const targetTime = scheduledAtByTarget[target.id]
        ? fromDateTimeLocalInput(scheduledAtByTarget[target.id], timezone)
        : isoScheduledAt;
      return {
        attachments: buildSignatureAttachments({
          platform: target.platform,
          selectedIds: signatureIds,
          signatures,
        }),
        credentialId: target.credentialId,
        platform: target.platform,
        ...(targetTime ? { scheduledAt: targetTime } : {}),
        ...(signatureIds.length > 0 ? { signatureIds } : {}),
        timezone,
      };
    });

    onSchedule?.({
      platforms,
      ...(selectedSetId ? { postingSetId: selectedSetId } : {}),
      scheduledAt: isoScheduledAt,
      ...(payloadTargets.length > 0 ? { targets: payloadTargets } : {}),
      timezone,
    });

    if (onUiAction && action.contentId) {
      setIsSubmitting(true);
      try {
        await onUiAction('confirm_publish_post', {
          contentId: action.contentId,
          platforms,
          ...(selectedSetId ? { postingSetId: selectedSetId } : {}),
          scheduledAt: isoScheduledAt,
          sourceActionId: action.id,
          ...(payloadTargets.length > 0 ? { targets: payloadTargets } : {}),
          timezone,
        });
      } catch {
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
    }

    setIsScheduled(true);
  }, [
    action.contentId,
    action.id,
    dateTime,
    hasSelectedTargetBlockers,
    onSchedule,
    onUiAction,
    selectedPlatforms,
    selectedSetId,
    selectedTargets,
    scheduledAtByTarget,
    signatureIdsByTarget,
    signatures,
    targetProposals.length,
    timezone,
    translate,
  ]);

  const isResultCard =
    Boolean(action.ctas?.length) &&
    !action.contentId &&
    targetProposals.length === 0 &&
    availablePlatforms.length === 0;

  if (isScheduled || isResultCard) {
    const count =
      selectedTargets.length > 0
        ? selectedTargets.length
        : selectedPlatforms.size || 1;
    return (
      <div className="my-2 border border-success/20 bg-success/10 p-4">
        <div className="flex items-center gap-2 text-success">
          <Check className="size-5" />
          <span className="text-sm font-medium">
            {action.title || translate('scheduled', { count })}
          </span>
        </div>
        {action.description ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {action.description}
          </p>
        ) : null}
      </div>
    );
  }

  const isConfirmDisabled =
    !dateTime ||
    isSubmitting ||
    (targetProposals.length > 0
      ? selectedTargets.length === 0 || hasSelectedTargetBlockers
      : selectedPlatforms.size === 0);

  return (
    <div className="my-2 border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <Calendar className="size-5 text-blue-500" />
        <h3 className="text-sm font-semibold">
          {action.title || translate('defaultTitle')}
        </h3>
      </div>

      {action.description ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      ) : null}

      <PostingSetPicker
        canSave={selectedTargets.length > 0 || selectedPlatforms.size > 0}
        expandError={expandError ?? undefined}
        isExpanding={isExpanding}
        isSaving={isSaving}
        onSaveCurrent={(label) => {
          void handleSaveCurrent(label);
        }}
        onSelectSet={(id) => {
          void handleSelectSet(id);
        }}
        saveError={saveError ?? undefined}
        selectedSetId={selectedSetId}
        sets={sets}
      />

      <div className="mb-3">
        <span className="mb-1 block text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          {translate('timezone')}
        </span>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger aria-label={translate('timezoneAria')}>
            <SelectValue placeholder={translate('timezone')} />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((zone) => (
              <SelectItem key={zone.value} value={zone.value}>
                {zone.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-3">
        <label
          className="mb-1 block text-2xs font-medium uppercase tracking-wider text-muted-foreground"
          htmlFor="schedule-post-date-time"
        >
          <Clock className="mr-1 inline size-3" />
          Date & Time
        </label>
        <Input
          id="schedule-post-date-time"
          onChange={(event) => setDateTime(event.target.value)}
          type="datetime-local"
          value={dateTime}
        />
      </div>

      {targetProposals.length > 0 ? (
        <div className="mb-3">
          <span className="mb-1 block text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            {translate('channels')}
          </span>
          <div className="space-y-3">
            {targetProposals.map((target) => {
              const isSelected = selectedTargetIdSet.has(target.id);
              const blockers = isSelected
                ? (targetBlockers[target.id] ?? [])
                : [];
              const isUnhealthy = !isHealthyReferenceState(
                target.referenceState,
              );
              return (
                <div key={target.id} className="border border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Button
                      className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                      onClick={() => toggleTarget(target.id)}
                      variant={ButtonVariant.UNSTYLED}
                      withWrapper={false}
                    >
                      {targetToggleName(target, targetProposals)}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {target.label}
                      {isUnhealthy
                        ? ` · ${postingSetsTranslate('disconnected')}`
                        : ''}
                    </span>
                  </div>
                  {isSelected ? (
                    <>
                      <Input
                        className="mb-2"
                        id={`schedule-post-target-${target.id}`}
                        label={`${target.label} time`}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setScheduledAtByTarget((current) => ({
                            ...current,
                            [target.id]: nextValue,
                          }));
                        }}
                        type="datetime-local"
                        value={scheduledAtByTarget[target.id] ?? dateTime}
                      />
                      <PostingSignaturePicker
                        onChange={(signatureIds) => {
                          setSignatureIdsByTarget((current) => ({
                            ...current,
                            [target.id]: signatureIds,
                          }));
                        }}
                        platform={target.platform}
                        selectedIds={signatureIdsByTarget[target.id] ?? []}
                        signatures={signatures}
                      />
                      {blockers.length > 0 ? (
                        <div className="space-y-1 border border-destructive/30 bg-destructive/5 p-2">
                          <p className="text-2xs font-medium uppercase tracking-wider text-destructive">
                            {translate('cannotSchedule')}
                          </p>
                          {blockers.map((blocker) => (
                            <p
                              key={`${blocker.code}:${blocker.field ?? ''}:${blocker.message}`}
                              className="text-xs text-destructive"
                            >
                              {blocker.message}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : availablePlatforms.length > 0 ? (
        <div className="mb-3">
          <div className="mb-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            {translate('channels')}
          </div>
          <div className="flex flex-wrap gap-2">
            {availablePlatforms.map((platform) => (
              <label
                key={platform}
                htmlFor={`schedule-post-platform-${platform}`}
                className={`flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 text-xs transition-colors ${
                  selectedPlatforms.has(platform)
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                <Input
                  className="sr-only"
                  id={`schedule-post-platform-${platform}`}
                  isChecked={selectedPlatforms.has(platform)}
                  onChange={() => togglePlatform(platform)}
                  type="checkbox"
                />
                {platform.charAt(0).toUpperCase() + platform.slice(1)}
              </label>
            ))}
          </div>
        </div>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">
          {translate('noChannels')}
        </p>
      )}

      {action.creditEstimate != null ? (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <DollarSign className="size-3.5" />
          <span>Estimated cost: {action.creditEstimate} credits</span>
        </div>
      ) : null}

      {validationError ? (
        <p className="mb-3 text-xs text-destructive">{validationError}</p>
      ) : null}
      {hasUnhealthySelectedTarget ? (
        <p className="mb-3 text-xs text-warning">
          {postingSetsTranslate('disconnected')}
        </p>
      ) : null}

      <Button
        className="w-full justify-center"
        icon={<Calendar className="size-4" />}
        isDisabled={isConfirmDisabled}
        isLoading={isSubmitting}
        onClick={() => {
          void handleSchedule();
        }}
        variant={ButtonVariant.DEFAULT}
      >
        {isSubmitting ? translate('scheduling') : translate('confirmSchedule')}
      </Button>
    </div>
  );
}

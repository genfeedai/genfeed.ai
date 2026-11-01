import { useAgentUiActionRequest } from '@genfeedai/agent/hooks/use-agent-ui-action-request';
import type {
  AgentPublishSettingField,
  AgentPublishTargetProposal,
  AgentUiAction,
  AgentUiActionHandler,
} from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant, PostVisibility } from '@genfeedai/contracts';
import { usePostingSets } from '@hooks/data/content/use-posting-sets/use-posting-sets';
import { usePostingSignatures } from '@hooks/data/content/use-posting-signatures/use-posting-signatures';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { Toggle } from '@ui/primitives/toggle';
import PostingSetPicker from '@ui/publisher/PostingSetPicker';
import PostingSignaturePicker from '@ui/publisher/PostingSignaturePicker';
import { Calendar, CircleCheck, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type ChangeEvent,
  type ReactElement,
  useCallback,
  useMemo,
  useState,
} from 'react';
import {
  readPostVisibilityValue,
  readPublishTargetProposals,
  resolveEffectiveCaption,
  resolveLiveTargetBlockers,
  targetToggleName,
  VISIBILITY_VALUES,
} from './publish-post-card.helpers';
import {
  buildSignatureAttachments,
  postingSetTargetsFromSelection,
} from './schedule-post-card.helpers';

const VISIBILITY_MESSAGE_KEYS = {
  [PostVisibility.PRIVATE]: 'visibilityPrivate',
  [PostVisibility.PUBLIC]: 'visibilityPublic',
  [PostVisibility.UNLISTED]: 'visibilityUnlisted',
} as const;

interface PublishPostCardProps {
  action: AgentUiAction;
  onUiAction?: AgentUiActionHandler;
}

function toDatetimeLocalValue(value: string | undefined): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function PublishTargetSettingField(params: {
  field: AgentPublishSettingField;
  fieldId: string;
  onChange: (value: unknown) => void;
  value: unknown;
}): ReactElement {
  const { field, fieldId, onChange, value } = params;

  if (field.type === 'boolean') {
    return (
      <Label className="flex items-center gap-2 border border-border px-2.5 py-2 text-sm text-foreground font-normal leading-normal">
        <Checkbox
          id={fieldId}
          isChecked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{field.label}</span>
      </Label>
    );
  }

  if (field.type === 'select' && field.options) {
    return (
      <Select
        value={typeof value === 'string' ? value : ''}
        onValueChange={onChange}
      >
        <SelectTrigger id={fieldId} aria-label={field.label}>
          <SelectValue placeholder={field.label} />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === 'multi_select' && field.options) {
    const selected = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
    const _selectedSet = new Set(selected);

    return (
      <SegmentedControl
        appearance="chip"
        ariaLabel={field.label}
        onValueChange={onChange}
        options={field.options.map((option) => ({
          label: option.label,
          value: option.value,
        }))}
        size="sm"
        type="multiple"
        value={selected}
      />
    );
  }

  if (field.type === 'number') {
    return (
      <Input
        id={fieldId}
        type="number"
        value={
          typeof value === 'number' || typeof value === 'string' ? value : ''
        }
        onChange={(event) => {
          const next = event.target.value;
          if (next.trim().length === 0) {
            onChange(undefined);
            return;
          }
          const parsed = Number(next);
          onChange(Number.isFinite(parsed) ? parsed : next);
        }}
      />
    );
  }

  if (field.type === 'text') {
    return (
      <Textarea
        id={fieldId}
        rows={3}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <Input
      id={fieldId}
      type={field.type === 'url' ? 'url' : 'text'}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function PublishPostCard({
  action,
  onUiAction,
}: PublishPostCardProps): ReactElement {
  const translate = useTranslations('agent.publishPostCard');
  const targetProposals = useMemo(
    () => readPublishTargetProposals(action.targets),
    [action.targets],
  );
  const availablePlatforms = useMemo(
    () =>
      Array.isArray(action.data?.availablePlatforms)
        ? (action.data.availablePlatforms as string[])
        : (action.platforms ?? []),
    [action.data?.availablePlatforms, action.platforms],
  );
  const availablePlatformSet = useMemo(
    () => new Set(availablePlatforms),
    [availablePlatforms],
  );
  const initialPlatforms =
    action.platforms && action.platforms.length > 0
      ? action.platforms.filter((platform) =>
          availablePlatformSet.has(platform),
        )
      : availablePlatforms;

  const [caption, setCaption] = useState(action.textContent ?? '');
  const [scheduledAt, setScheduledAt] = useState(() =>
    toDatetimeLocalValue(action.scheduledAt),
  );
  const [selectedPlatforms, setSelectedPlatforms] =
    useState<string[]>(initialPlatforms);
  const [visibility, setVisibility] = useState<PostVisibility>(
    action.visibility ?? PostVisibility.PUBLIC,
  );
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>(() =>
    targetProposals
      .filter((target) => target.isSelected !== false)
      .map((target) => target.id),
  );
  const [captionOverrides, setCaptionOverrides] = useState<
    Record<string, string>
  >(() => {
    const initial: Record<string, string> = {};
    const shared = action.textContent ?? '';
    for (const target of targetProposals) {
      if (target.caption && target.caption !== shared) {
        initial[target.id] = target.caption;
      }
    }
    return initial;
  });
  const [settingsByTarget, setSettingsByTarget] = useState<
    Record<string, Record<string, unknown>>
  >(() => {
    const initial: Record<string, Record<string, unknown>> = {};
    for (const target of targetProposals) {
      initial[target.id] = { ...target.settings };
    }
    return initial;
  });
  const [visibilityByTarget, setVisibilityByTarget] = useState<
    Record<string, PostVisibility>
  >(() => {
    const initial: Record<string, PostVisibility> = {};
    for (const target of targetProposals) {
      initial[target.id] = target.visibility;
    }
    return initial;
  });
  const request = useAgentUiActionRequest(onUiAction);
  // The run is keyed by this card, so the phase is known before the payload.
  const phase = request.getPhase('confirm_publish_post', {
    sourceActionId: action.id,
  });
  const isSubmitting = phase === 'running' || phase === 'awaiting';
  const isSubmitted = phase === 'completed';
  const [selectedSetId, setSelectedSetId] = useState<string | undefined>();
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
  const selectedPlatformSet = useMemo(
    () => new Set(selectedPlatforms),
    [selectedPlatforms],
  );
  const selectedTargetIdSet = useMemo(
    () => new Set(selectedTargetIds),
    [selectedTargetIds],
  );
  const publishMode = scheduledAt.trim() ? 'scheduled' : 'publish_now';

  const selectedTargets = useMemo(
    () =>
      targetProposals.filter((target) => selectedTargetIdSet.has(target.id)),
    [selectedTargetIdSet, targetProposals],
  );

  const targetBlockers = useMemo(() => {
    const blockersById: Record<string, AgentPublishTargetProposal['blockers']> =
      {};
    for (const target of selectedTargets) {
      blockersById[target.id] = resolveLiveTargetBlockers({
        caption: resolveEffectiveCaption(caption, captionOverrides[target.id]),
        credentialId: target.credentialId,
        media: target.media,
        platform: target.platform,
        publishMode,
        settings: settingsByTarget[target.id] ?? target.settings,
        visibility: visibilityByTarget[target.id] ?? visibility,
      });
    }
    return blockersById;
  }, [
    caption,
    captionOverrides,
    publishMode,
    selectedTargets,
    settingsByTarget,
    visibility,
    visibilityByTarget,
  ]);

  const hasSelectedTargetBlockers = selectedTargets.some(
    (target) => (targetBlockers[target.id] ?? []).length > 0,
  );

  const togglePlatform = useCallback((platform: string) => {
    setSelectedPlatforms((current) => {
      const next = new Set(current);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return [...next];
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
        ...(scheduledAt.trim()
          ? { scheduledDate: new Date(scheduledAt).toISOString() }
          : {}),
      });
      const expandedIds = new Set(
        expanded.map((target) => target.credentialId),
      );
      setSelectedTargetIds(
        targetProposals
          .filter((target) => expandedIds.has(target.credentialId))
          .map((target) => target.id),
      );
    },
    [expandSet, scheduledAt, targetProposals],
  );

  const handleSaveCurrent = useCallback(
    async (label: string) => {
      if (selectedTargets.length === 0) {
        return;
      }
      await createSet({
        label,
        targets: postingSetTargetsFromSelection({
          targets: selectedTargets.map((target) => ({
            credentialId: target.credentialId,
            platform: target.platform,
            signatureIds: signatureIdsByTarget[target.id],
          })),
        }),
      });
    },
    [createSet, selectedTargets, signatureIdsByTarget],
  );

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
    const hasStructuredTargets = targetProposals.length > 0;
    const platforms = hasStructuredTargets
      ? Array.from(new Set(selectedTargets.map((target) => target.platform)))
      : selectedPlatforms;

    if (
      !onUiAction ||
      !action.contentId ||
      platforms.length === 0 ||
      isSubmitting ||
      isSubmitted ||
      (hasStructuredTargets && hasSelectedTargetBlockers)
    ) {
      return;
    }

    {
      const scheduleInput = scheduledAt.trim();
      const scheduleDate = scheduleInput ? new Date(scheduleInput) : undefined;
      const normalizedScheduledAt = scheduleDate
        ? Number.isNaN(scheduleDate.getTime())
          ? scheduleInput
          : scheduleDate.toISOString()
        : undefined;
      await request.submit('confirm_publish_post', {
        caption: caption.trim() || undefined,
        contentId: action.contentId,
        platforms,
        scheduledAt: normalizedScheduledAt,
        sourceActionId: action.id,
        ...(selectedSetId ? { postingSetId: selectedSetId } : {}),
        ...(hasStructuredTargets
          ? {
              targets: selectedTargets.map((target) => {
                const signatureIds = signatureIdsByTarget[target.id] ?? [];
                return {
                  attachments: buildSignatureAttachments({
                    platform: target.platform,
                    selectedIds: signatureIds,
                    signatures,
                  }),
                  caption: resolveEffectiveCaption(
                    caption,
                    captionOverrides[target.id],
                  ),
                  credentialId: target.credentialId,
                  platform: target.platform,
                  settings: settingsByTarget[target.id] ?? target.settings,
                  ...(signatureIds.length > 0 ? { signatureIds } : {}),
                  visibility: visibilityByTarget[target.id] ?? visibility,
                };
              }),
            }
          : {}),
        visibility,
      });
    }
  }, [
    action.contentId,
    action.id,
    caption,
    captionOverrides,
    hasSelectedTargetBlockers,
    isSubmitted,
    isSubmitting,
    onUiAction,
    request,
    scheduledAt,
    selectedPlatforms,
    selectedSetId,
    selectedTargets,
    signatureIdsByTarget,
    signatures,
    settingsByTarget,
    targetProposals.length,
    visibility,
    visibilityByTarget,
  ]);

  const isConfirmDisabled =
    !action.contentId ||
    isSubmitting ||
    (targetProposals.length > 0
      ? selectedTargets.length === 0 || hasSelectedTargetBlockers
      : selectedPlatforms.length === 0);

  if (isSubmitted) {
    return (
      <div className="my-2 border border-success/20 bg-background p-4">
        <div className="flex items-center gap-2 text-success">
          <CircleCheck className="size-5" />
          <span className="text-sm font-medium">
            {scheduledAt ? translate('scheduled') : translate('confirmed')}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <Send className="size-5 text-emerald-500" />
        <h3 className="text-sm font-semibold text-foreground">
          {action.title || translate('defaultTitle')}
        </h3>
      </div>

      {action.description ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      ) : null}

      <PostingSetPicker
        canSave={selectedTargets.length > 0 || selectedPlatforms.length > 0}
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

      <div className="flex flex-col gap-1.5 mb-3">
        <Label
          htmlFor="publish-caption"
          className="text-2xs uppercase tracking-wider text-muted-foreground"
        >
          {translate('caption')}
        </Label>
        <Textarea
          id="publish-caption"
          value={caption}
          onChange={handleCaptionChange}
          rows={4}
          placeholder={translate('captionPlaceholder')}
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
              const effectiveCaption = resolveEffectiveCaption(
                caption,
                captionOverrides[target.id],
              );
              const blockers = isSelected
                ? (targetBlockers[target.id] ?? [])
                : [];
              const warnings = target.warnings ?? [];
              const settingFields = target.settingFields ?? [];

              return (
                <div key={target.id} className="border border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Toggle
                      onPressedChange={() => toggleTarget(target.id)}
                      pressed={isSelected}
                      size="sm"
                      variant="chip"
                    >
                      {targetToggleName(target, targetProposals)}
                    </Toggle>
                    <span className="text-xs text-muted-foreground">
                      {target.label}
                    </span>
                  </div>

                  {isSelected ? (
                    <>
                      <div className="flex flex-col gap-1.5 mb-2">
                        <Label
                          htmlFor={`publish-caption-${target.id}`}
                          className="text-2xs uppercase tracking-wider text-muted-foreground"
                        >
                          {translate('channelCaption', {
                            platform: target.label,
                          })}
                        </Label>
                        <Textarea
                          id={`publish-caption-${target.id}`}
                          value={captionOverrides[target.id] ?? ''}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setCaptionOverrides((current) => ({
                              ...current,
                              [target.id]: nextValue,
                            }));
                          }}
                          rows={3}
                          placeholder={
                            effectiveCaption ||
                            translate('channelCaptionPlaceholder')
                          }
                        />
                      </div>

                      <div className="mb-2">
                        <span className="mb-1 block text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                          {translate('visibility')}
                        </span>
                        <Select
                          value={
                            visibilityByTarget[target.id] ?? target.visibility
                          }
                          onValueChange={(value) => {
                            setVisibilityByTarget((current) => ({
                              ...current,
                              [target.id]: readPostVisibilityValue(value),
                            }));
                          }}
                        >
                          <SelectTrigger
                            aria-label={`${target.label} ${translate('visibilityAria')}`}
                          >
                            <SelectValue
                              placeholder={translate('visibilityPlaceholder')}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {VISIBILITY_VALUES.map((value) => (
                              <SelectItem key={value} value={value}>
                                {translate(VISIBILITY_MESSAGE_KEYS[value])}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

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

                      {settingFields.length > 0 ? (
                        <div className="mb-2 space-y-2">
                          <span className="block text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                            {translate('channelSettings')}
                          </span>
                          {settingFields.map((field) => {
                            const fieldId = `${target.id}-${field.key}`;
                            return (
                              <div
                                className="flex flex-col gap-1.5"
                                key={field.key}
                              >
                                {field.type === 'boolean' ? null : (
                                  <Label
                                    htmlFor={fieldId}
                                    className="text-2xs uppercase tracking-wider text-muted-foreground"
                                  >
                                    {field.label}
                                    {field.required ? ' *' : ''}
                                  </Label>
                                )}
                                <PublishTargetSettingField
                                  field={field}
                                  fieldId={fieldId}
                                  value={
                                    settingsByTarget[target.id]?.[field.key]
                                  }
                                  onChange={(nextValue) => {
                                    setSettingsByTarget((current) => ({
                                      ...current,
                                      [target.id]: {
                                        ...(current[target.id] ?? {}),
                                        [field.key]: nextValue,
                                      },
                                    }));
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {blockers.length > 0 ? (
                        <Alert className="mb-2" size="sm" variant="destructive">
                          <AlertTitle>{translate('cannotPublish')}</AlertTitle>
                          {blockers.map((blocker) => (
                            <AlertDescription
                              key={`${blocker.code}:${blocker.field ?? ''}:${blocker.message}`}
                            >
                              {blocker.message}
                            </AlertDescription>
                          ))}
                        </Alert>
                      ) : null}

                      {warnings.length > 0 ? (
                        <Alert size="sm" variant="warning">
                          <AlertTitle>{translate('reviewWarnings')}</AlertTitle>
                          {warnings.map((warning) => (
                            <AlertDescription
                              key={`${warning.code}:${warning.field ?? ''}:${warning.message}`}
                            >
                              {warning.message}
                            </AlertDescription>
                          ))}
                        </Alert>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <span className="mb-1 block text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            {translate('platforms')}
          </span>
          <SegmentedControl
            appearance="chip"
            ariaLabel={translate('platforms')}
            onValueChange={(next) => {
              const changed = [
                ...next.filter(
                  (platform) => !selectedPlatformSet.has(platform),
                ),
                ...availablePlatforms.filter(
                  (platform) =>
                    selectedPlatformSet.has(platform) &&
                    !next.includes(platform),
                ),
              ];
              for (const platform of changed) {
                togglePlatform(platform);
              }
            }}
            options={availablePlatforms.map((platform) => ({
              label: platform,
              value: platform,
            }))}
            size="sm"
            type="multiple"
            value={availablePlatforms.filter((platform) =>
              selectedPlatformSet.has(platform),
            )}
          />
        </div>
      )}

      <div className="mb-4">
        <span className="mb-1 block text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          {translate('visibility')}
        </span>
        <Select
          value={visibility}
          onValueChange={(value) =>
            setVisibility(readPostVisibilityValue(value))
          }
        >
          <SelectTrigger aria-label={translate('visibilityAria')}>
            <SelectValue placeholder={translate('visibilityPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {VISIBILITY_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {translate(VISIBILITY_MESSAGE_KEYS[value])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5 mb-4">
        <Label
          htmlFor="publish-schedule"
          className="text-2xs uppercase tracking-wider text-muted-foreground"
        >
          <Calendar className="mr-1 inline size-3" />
          {translate('scheduleForLater')}
        </Label>
        <Input
          id="publish-schedule"
          type="datetime-local"
          value={scheduledAt}
          onChange={handleScheduleChange}
        />
      </div>

      <Button
        variant={ButtonVariant.DEFAULT}
        withWrapper={false}
        onClick={() => {
          void handleConfirm();
        }}
        isDisabled={isConfirmDisabled}
        className="flex w-full items-center justify-center gap-2 rounded bg-success px-4 py-2 text-sm text-success-foreground hover:bg-success/90"
      >
        <Send className="size-4" />
        {isSubmitting
          ? translate('publishing')
          : scheduledAt
            ? translate('confirmSchedule')
            : translate('confirmPublish')}
      </Button>
      {phase === 'awaiting' ? (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {translate('awaitingResult')}
        </p>
      ) : null}
    </div>
  );
}

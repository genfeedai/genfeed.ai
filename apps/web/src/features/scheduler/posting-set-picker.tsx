'use client';

import { ComponentSize } from '@genfeedai/contracts';
import type {
  IPostingSet,
  IPostingSetTarget,
  IPostingSignature,
  PostingSetReferenceState,
} from '@genfeedai/contracts/interfaces';
import { isRecord, readString } from '@genfeedai/utils/data/extract.util';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { PostingSetsService } from '@services/content/posting-sets.service';
import { PostingSignaturesService } from '@services/content/posting-signatures.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { isCancelledRequest } from '@services/core/operation-error';
import { useQueryClient } from '@tanstack/react-query';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Badge } from '@ui/primitives/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import SharedPostingSetPicker from '@ui/publisher/PostingSetPicker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  PostingSetPickerTarget,
  SchedulerPostingSetPickerProps,
} from '@/features/scheduler/props/posting-set-picker.props';

const NONE_SIGNATURE_VALUE = 'none';
const EMPTY_POSTING_SETS: IPostingSet[] = [];
const EMPTY_SIGNATURES: IPostingSignature[] = [];
const UNHEALTHY_STATES = new Set<PostingSetReferenceState>([
  'deleted',
  'disabled',
  'disconnected',
  'platform_mismatch',
  'unavailable',
]);

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.flatMap((item) => {
    const next = readString(item);
    return next ? [next] : [];
  });
  return items.length > 0 ? items : undefined;
}

function toPlatform(value: string): string {
  return value.toLowerCase();
}

function parseExpandedTargets(
  targets: unknown[],
  postingSet: IPostingSet | null,
): PostingSetPickerTarget[] {
  const validationByCredential = new Map(
    (postingSet?.validation?.targets ?? []).map((entry) => [
      entry.credentialId,
      entry,
    ]),
  );
  const validationByKey = new Map(
    (postingSet?.validation?.targets ?? []).map((entry) => [
      entry.targetKey,
      entry,
    ]),
  );

  return targets.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const credentialId = readString(item.credentialId);
    const platform = readString(item.platform);
    if (!credentialId || !platform) {
      return [];
    }
    const targetKey = readString(item.targetKey);
    const validation =
      (targetKey ? validationByKey.get(targetKey) : undefined) ??
      validationByCredential.get(credentialId);

    return [
      {
        credentialId,
        issues: validation?.issues,
        platform: toPlatform(platform),
        scheduledDate: readString(item.scheduledDate),
        signatureIds:
          readStringArray(item.signatureIds) ??
          postingSet?.targets.find(
            (target) =>
              target.credentialId === credentialId ||
              target.targetKey === targetKey,
          )?.signatureIds,
        targetKey,
        timezone: readString(item.timezone),
        validationState: validation?.state,
      },
    ];
  });
}

function toCreateTargets(
  targets: PostingSetPickerTarget[],
  signatureId: string | undefined,
): IPostingSetTarget[] {
  return targets.flatMap((target, index) => {
    const signatureIds = [
      ...(target.signatureIds ?? []),
      ...(signatureId ? [signatureId] : []),
    ].filter((id, idIndex, all) => all.indexOf(id) === idIndex);

    return [
      {
        credentialId: target.credentialId,
        order: index,
        platform: target.platform as IPostingSetTarget['platform'],
        ...(signatureIds.length > 0 ? { signatureIds } : {}),
        targetKey:
          target.targetKey ?? `${target.platform}:${target.credentialId}`,
        ...(target.timezone ? { timezone: target.timezone } : {}),
      },
    ];
  });
}

/**
 * Nested under the shared `posting-sets` / `posting-signatures` roots, so a set
 * created elsewhere (publishing settings) refreshes the picker too.
 */
function brandPostingSetsQueryKey(brandId: string) {
  return ['posting-sets', 'by-brand', brandId] as const;
}

function brandPostingSignaturesQueryKey(brandId: string) {
  return ['posting-signatures', 'by-brand', brandId] as const;
}

function isCancelledLoad(error: unknown): boolean {
  return (
    isCancelledRequest(error) ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function unhealthyBadgeVariant(
  state: PostingSetReferenceState | undefined,
): 'destructive' | 'warning' {
  if (state === 'disconnected' || state === 'disabled') {
    return 'warning';
  }
  return 'destructive';
}

export default function PostingSetPicker({
  brandId,
  currentTargets,
  isDisabled,
  onApply,
  timezone,
}: SchedulerPostingSetPickerProps) {
  const notifications = NotificationsService.getInstance();
  const getPostingSetsService = useAuthedService((token: string) =>
    PostingSetsService.getInstance(token),
  );

  const queryClient = useQueryClient();
  const hasBrand = Boolean(brandId);
  // Cached per brand: reopening the scheduler paints the brand's posting sets
  // and signatures at once, then refreshes them in the background.
  const postingSetsQuery = useAuthedQuery<PostingSetsService, IPostingSet[]>({
    enabled: hasBrand,
    queryFn: (service, signal) => service.findAll({ brandId }, signal),
    queryKey: brandPostingSetsQueryKey(brandId),
    service: (token: string) => PostingSetsService.getInstance(token),
  });
  const signaturesQuery = useAuthedQuery<
    PostingSignaturesService,
    IPostingSignature[]
  >({
    enabled: hasBrand,
    queryFn: (service, signal) => service.findAll({ brandId }, signal),
    queryKey: brandPostingSignaturesQueryKey(brandId),
    service: (token: string) => PostingSignaturesService.getInstance(token),
  });
  const postingSets = postingSetsQuery.data ?? EMPTY_POSTING_SETS;
  const signatures = signaturesQuery.data ?? EMPTY_SIGNATURES;
  // A brand's first paint is loading, never the "no posting sets" message.
  const isLoading = hasBrand && postingSetsQuery.isPending;
  const loadError = postingSetsQuery.error ?? signaturesQuery.error;
  const [selectedSetId, setSelectedSetId] = useState<string>('');
  const [expandedTargets, setExpandedTargets] = useState<
    PostingSetPickerTarget[]
  >([]);
  const [newSetLabel, setNewSetLabel] = useState('');
  const [selectedSignatureId, setSelectedSignatureId] =
    useState(NONE_SIGNATURE_VALUE);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedSet = useMemo(
    () => postingSets.find((set) => set.id === selectedSetId) ?? null,
    [postingSets, selectedSetId],
  );

  // A read that navigation cancelled stays silent; a real failure is reported
  // once, after React Query's retry.
  useEffect(() => {
    if (!loadError || isCancelledLoad(loadError)) {
      return;
    }
    logger.error('Failed to load posting sets', loadError);
    notifications.error('Failed to load posting sets');
  }, [loadError, notifications]);

  const handleSelectSet = useCallback(
    async (postingSetId: string) => {
      setSelectedSetId(postingSetId);
      const postingSet =
        postingSets.find((set) => set.id === postingSetId) ?? null;
      setIsExpanding(true);
      try {
        const service = await getPostingSetsService();
        const result = await service.expand(postingSetId, { timezone });
        const targets = parseExpandedTargets(result.targets, postingSet);
        setExpandedTargets(targets);
        onApply(targets, postingSetId);
      } catch (error) {
        logger.error('Failed to expand posting set', error);
        notifications.error('Failed to expand posting set');
      } finally {
        setIsExpanding(false);
      }
    },
    [getPostingSetsService, notifications, onApply, postingSets, timezone],
  );

  const handleSaveCurrentSelection = useCallback(
    async (label: string) => {
      if (!brandId || !label || currentTargets.length === 0) {
        return;
      }
      setIsSaving(true);
      try {
        const service = await getPostingSetsService();
        const signatureId =
          selectedSignatureId === NONE_SIGNATURE_VALUE
            ? undefined
            : selectedSignatureId;
        const created = await service.post({
          brandId,
          label,
          targets: toCreateTargets(currentTargets, signatureId),
        });
        queryClient.setQueriesData<IPostingSet[]>(
          { queryKey: brandPostingSetsQueryKey(brandId) },
          (previous) => [created, ...(previous ?? [])],
        );
        setNewSetLabel('');
        notifications.success?.('Posting set saved');
      } catch (error) {
        logger.error('Failed to save posting set', error);
        notifications.error('Failed to save posting set');
      } finally {
        setIsSaving(false);
      }
    },
    [
      brandId,
      currentTargets,
      getPostingSetsService,
      notifications,
      queryClient,
      selectedSignatureId,
    ],
  );

  const previewTargets =
    expandedTargets.length > 0 ? expandedTargets : currentTargets;

  return (
    <SharedPostingSetPicker
      variant="cards"
      canSave={currentTargets.length > 0}
      isDisabled={isDisabled}
      isExpanding={isExpanding}
      isLoading={isLoading}
      isSaving={isSaving}
      onSaveCurrent={handleSaveCurrentSelection}
      onSelectSet={handleSelectSet}
      saveLabel={newSetLabel}
      onSaveLabelChange={setNewSetLabel}
      selectedSetId={selectedSetId}
      sets={postingSets}
      saveOptions={
        signatures.length > 0 ? (
          <Select
            disabled={isDisabled || isSaving}
            value={selectedSignatureId}
            onValueChange={setSelectedSignatureId}
          >
            <SelectTrigger aria-label="Posting signature">
              <SelectValue placeholder="Attach a signature (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_SIGNATURE_VALUE}>No signature</SelectItem>
              {signatures.map((signature) => (
                <SelectItem
                  className="normal-case"
                  key={signature.id}
                  value={signature.id}
                >
                  {signature.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null
      }
    >
      {previewTargets.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="gen-label-sm text-muted-foreground">Targets</p>
          {previewTargets.map((target) => {
            const isUnhealthy =
              target.validationState !== undefined &&
              UNHEALTHY_STATES.has(target.validationState);
            return (
              <div
                key={`${target.credentialId}:${target.platform}`}
                className="flex flex-wrap items-center gap-2"
              >
                <PlatformBadge
                  platform={target.platform}
                  size={ComponentSize.SM}
                />
                {isUnhealthy ? (
                  <Badge
                    variant={unhealthyBadgeVariant(target.validationState)}
                  >
                    {target.validationState?.replace('_', ' ') ?? 'unhealthy'}
                  </Badge>
                ) : null}
                {target.issues?.[0] ? (
                  <span className="text-xs text-muted-foreground">
                    {target.issues[0]}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {selectedSet && expandedTargets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {selectedSet.label} has no expandable targets.
        </p>
      ) : null}
    </SharedPostingSetPicker>
  );
}

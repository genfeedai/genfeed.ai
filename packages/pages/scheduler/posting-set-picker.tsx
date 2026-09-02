'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  IPostingSet,
  IPostingSetTarget,
  IPostingSignature,
  PostingSetReferenceState,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  PostingSetPickerProps,
  PostingSetPickerTarget,
} from '@props/scheduler/posting-set-picker.props';
import { PostingSetsService } from '@services/content/posting-sets.service';
import { PostingSignaturesService } from '@services/content/posting-signatures.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useCallback, useEffect, useMemo, useState } from 'react';

const NONE_SIGNATURE_VALUE = 'none';
const UNHEALTHY_STATES = new Set<PostingSetReferenceState>([
  'deleted',
  'disabled',
  'disconnected',
  'platform_mismatch',
  'unavailable',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

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
}: PostingSetPickerProps) {
  const notifications = NotificationsService.getInstance();
  const getPostingSetsService = useAuthedService((token: string) =>
    PostingSetsService.getInstance(token),
  );
  const getPostingSignaturesService = useAuthedService((token: string) =>
    PostingSignaturesService.getInstance(token),
  );

  const [postingSets, setPostingSets] = useState<IPostingSet[]>([]);
  const [signatures, setSignatures] = useState<IPostingSignature[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string>('');
  const [expandedTargets, setExpandedTargets] = useState<
    PostingSetPickerTarget[]
  >([]);
  const [newSetLabel, setNewSetLabel] = useState('');
  const [selectedSignatureId, setSelectedSignatureId] =
    useState(NONE_SIGNATURE_VALUE);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedSet = useMemo(
    () => postingSets.find((set) => set.id === selectedSetId) ?? null,
    [postingSets, selectedSetId],
  );

  const loadLists = useCallback(
    async (signal: AbortSignal) => {
      if (!brandId) {
        return;
      }
      setIsLoading(true);
      try {
        const [setsService, signaturesService] = await Promise.all([
          getPostingSetsService(),
          getPostingSignaturesService(),
        ]);
        const [sets, signatureRows] = await Promise.all([
          setsService.findAll({ brandId }, signal),
          signaturesService.findAll({ brandId }, signal),
        ]);
        if (signal.aborted) {
          return;
        }
        setPostingSets(sets);
        setSignatures(signatureRows);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        logger.error('Failed to load posting sets', error);
        if (!signal.aborted) {
          notifications.error('Failed to load posting sets');
        }
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [
      brandId,
      getPostingSetsService,
      getPostingSignaturesService,
      notifications,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadLists(controller.signal);
    return () => controller.abort();
  }, [loadLists]);

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

  const handleSaveCurrentSelection = useCallback(async () => {
    const label = newSetLabel.trim();
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
      setPostingSets((previous) => [created, ...previous]);
      setNewSetLabel('');
      notifications.success?.('Posting set saved');
    } catch (error) {
      logger.error('Failed to save posting set', error);
      notifications.error('Failed to save posting set');
    } finally {
      setIsSaving(false);
    }
  }, [
    brandId,
    currentTargets,
    getPostingSetsService,
    newSetLabel,
    notifications,
    selectedSignatureId,
  ]);

  const previewTargets =
    expandedTargets.length > 0 ? expandedTargets : currentTargets;

  return (
    <div className="flex flex-col gap-3">
      <p className="gen-label">Posting set</p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading posting sets…</p>
      ) : postingSets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No posting sets yet. Save the current selection to reuse it.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {postingSets.map((postingSet) => (
            <div
              key={postingSet.id}
              className="gen-glass flex items-center justify-between gap-3 rounded-lg p-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-sm font-medium">
                  {postingSet.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {postingSet.targets.length} target
                  {postingSet.targets.length === 1 ? '' : 's'}
                </span>
              </div>
              <Button
                isDisabled={isDisabled || isExpanding}
                isLoading={isExpanding && selectedSetId === postingSet.id}
                label={selectedSetId === postingSet.id ? 'Selected' : 'Use set'}
                size={ButtonSize.SM}
                variant={
                  selectedSetId === postingSet.id
                    ? ButtonVariant.DEFAULT
                    : ButtonVariant.SECONDARY
                }
                onClick={() => {
                  void handleSelectSet(postingSet.id);
                }}
              />
            </div>
          ))}
        </div>
      )}

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
                <Badge variant="outline">{target.platform}</Badge>
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

      <div className="flex flex-col gap-2">
        <p className="gen-label-sm text-muted-foreground">
          Save current selection as set
        </p>
        <Input
          aria-label="Posting set label"
          isDisabled={isDisabled || isSaving}
          placeholder="Set label"
          value={newSetLabel}
          onChange={(event) => setNewSetLabel(event.target.value)}
        />
        {signatures.length > 0 ? (
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
                <SelectItem key={signature.id} value={signature.id}>
                  {signature.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button
          isDisabled={
            isDisabled ||
            isSaving ||
            newSetLabel.trim().length === 0 ||
            currentTargets.length === 0
          }
          isLoading={isSaving}
          label="Save current selection as set"
          variant={ButtonVariant.SECONDARY}
          onClick={() => {
            void handleSaveCurrentSelection();
          }}
        />
      </div>
    </div>
  );
}

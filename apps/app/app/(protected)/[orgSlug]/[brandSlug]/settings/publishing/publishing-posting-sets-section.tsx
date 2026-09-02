'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ICredential, IPostingSet } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import type { PublishingPostingSetsSectionProps } from '@props/scheduler/posting-set-picker.props';
import { PostingSetsService } from '@services/content/posting-sets.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function getCredentialLabel(credential: ICredential): string {
  const handle = credential.externalHandle?.replace(/^@/, '');
  return (
    credential.label ??
    credential.externalName ??
    (handle ? `@${handle}` : credential.platform)
  );
}

export default function PublishingPostingSetsSection({
  brandId,
  timezone,
}: PublishingPostingSetsSectionProps) {
  const notifications = NotificationsService.getInstance();
  const { brand } = useBrandDetail();
  const getPostingSetsService = useAuthedService((token: string) =>
    PostingSetsService.getInstance(token),
  );

  const connectedCredentials = useMemo(
    () =>
      (brand?.credentials ?? []).filter(
        (credential) => credential.isConnected && credential.id,
      ),
    [brand?.credentials],
  );

  const [postingSets, setPostingSets] = useState<IPostingSet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [selectedCredentialIds, setSelectedCredentialIds] = useState<string[]>(
    [],
  );
  const [previewBySetId, setPreviewBySetId] = useState<
    Record<string, Array<{ credentialId: string; platform: string }>>
  >({});

  const loadSets = useCallback(
    async (signal: AbortSignal) => {
      if (!brandId) {
        return;
      }
      setIsLoading(true);
      try {
        const service = await getPostingSetsService();
        const sets = await service.findAll({ brand: brandId }, signal);
        if (!signal.aborted) {
          setPostingSets(sets);
        }
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
    [brandId, getPostingSetsService, notifications],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSets(controller.signal);
    return () => controller.abort();
  }, [loadSets]);

  const toggleCredential = useCallback((credentialId: string) => {
    setSelectedCredentialIds((previous) =>
      previous.includes(credentialId)
        ? previous.filter((id) => id !== credentialId)
        : [...previous, credentialId],
    );
  }, []);

  const handleCreate = useCallback(async () => {
    const label = newLabel.trim();
    if (!brandId || !label || selectedCredentialIds.length === 0) {
      return;
    }
    setIsSaving(true);
    try {
      const service = await getPostingSetsService();
      const selected = connectedCredentials.filter((credential) =>
        selectedCredentialIds.includes(credential.id),
      );
      const created = await service.post({
        brandId,
        label,
        targets: selected.map((credential, index) => ({
          credentialId: credential.id,
          order: index,
          platform: credential.platform,
          targetKey: `${String(credential.platform).toLowerCase()}:${credential.id}`,
        })),
      });
      setPostingSets((previous) => [created, ...previous]);
      setNewLabel('');
      setSelectedCredentialIds([]);
      notifications.success('Posting set created');
    } catch (error) {
      logger.error('Failed to create posting set', error);
      notifications.error('Failed to create posting set');
    } finally {
      setIsSaving(false);
    }
  }, [
    brandId,
    connectedCredentials,
    getPostingSetsService,
    newLabel,
    notifications,
    selectedCredentialIds,
  ]);

  const handleDelete = useCallback(
    async (postingSetId: string) => {
      try {
        const service = await getPostingSetsService();
        await service.delete(postingSetId);
        setPostingSets((previous) =>
          previous.filter((set) => set.id !== postingSetId),
        );
        notifications.success('Posting set deleted');
      } catch (error) {
        logger.error('Failed to delete posting set', error);
        notifications.error('Failed to delete posting set');
      }
    },
    [getPostingSetsService, notifications],
  );

  const handleExpand = useCallback(
    async (postingSetId: string) => {
      try {
        const service = await getPostingSetsService();
        const result = await service.expand(postingSetId, { timezone });
        const preview = result.targets.flatMap((item) => {
          if (!isRecord(item)) {
            return [];
          }
          const credentialId = readString(item.credentialId);
          const platform = readString(item.platform);
          if (!credentialId || !platform) {
            return [];
          }
          return [{ credentialId, platform: platform.toLowerCase() }];
        });
        setPreviewBySetId((previous) => ({
          ...previous,
          [postingSetId]: preview,
        }));
      } catch (error) {
        logger.error('Failed to expand posting set', error);
        notifications.error('Failed to preview posting set');
      }
    },
    [getPostingSetsService, notifications, timezone],
  );

  return (
    <Card
      label="Posting sets"
      description="Reusable channel groups for scheduling. Unhealthy credentials stay visible as warnings."
      bodyClassName="gap-3 p-4"
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading posting sets…</p>
      ) : postingSets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No posting sets yet. Create one from connected accounts below.
        </p>
      ) : (
        <div className="space-y-3">
          {postingSets.map((postingSet) => {
            const unhealthy = (postingSet.validation?.targets ?? []).filter(
              (target) => target.state !== 'valid',
            );
            const preview = previewBySetId[postingSet.id] ?? [];
            return (
              <div
                key={postingSet.id}
                className="space-y-3 rounded-card bg-background-secondary/40 p-4 shadow-border"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{postingSet.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {postingSet.targets.length} target
                      {postingSet.targets.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      label="Expand preview"
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                      withWrapper={false}
                      onClick={() => {
                        void handleExpand(postingSet.id);
                      }}
                    />
                    <Button
                      label="Delete"
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                      withWrapper={false}
                      onClick={() => {
                        void handleDelete(postingSet.id);
                      }}
                    />
                  </div>
                </div>
                {unhealthy.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {unhealthy.map((target) => (
                      <Badge
                        key={`${target.targetKey}-${target.state}`}
                        variant={
                          target.state === 'disconnected' ||
                          target.state === 'disabled'
                            ? 'warning'
                            : 'destructive'
                        }
                      >
                        {target.state.replace('_', ' ')}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {preview.length > 0 ? (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {preview.map((target) => (
                      <li key={`${target.credentialId}-${target.platform}`}>
                        {target.platform} · {target.credentialId}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-3 border-t border-border pt-3">
        <p className="text-sm font-medium text-foreground">
          Create posting set
        </p>
        <Input
          aria-label="New posting set label"
          placeholder="Set label"
          value={newLabel}
          onChange={(event) => setNewLabel(event.target.value)}
        />
        {connectedCredentials.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Connect a social account to include it in a posting set.
          </p>
        ) : (
          <Select
            value={selectedCredentialIds[0]}
            onValueChange={(value) => toggleCredential(value)}
          >
            <SelectTrigger aria-label="Add account to posting set">
              <SelectValue placeholder="Add a connected account" />
            </SelectTrigger>
            <SelectContent>
              {connectedCredentials.map((credential) => (
                <SelectItem key={credential.id} value={credential.id}>
                  {getCredentialLabel(credential)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {selectedCredentialIds.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedCredentialIds.map((credentialId) => {
              const credential = connectedCredentials.find(
                (item) => item.id === credentialId,
              );
              return (
                <Button
                  key={credentialId}
                  label={
                    credential ? getCredentialLabel(credential) : credentialId
                  }
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  withWrapper={false}
                  onClick={() => toggleCredential(credentialId)}
                />
              );
            })}
          </div>
        ) : null}
        <div className="flex justify-end">
          <Button
            isDisabled={
              isSaving ||
              newLabel.trim().length === 0 ||
              selectedCredentialIds.length === 0
            }
            withWrapper={false}
            onClick={() => {
              void handleCreate();
            }}
          >
            {isSaving ? 'Saving…' : 'Create set'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

'use client';

import {
  ButtonSize,
  ButtonVariant,
  RssApprovalMode,
  RssImportPolicy,
} from '@genfeedai/contracts';
import type { ICredential, IRssSource } from '@genfeedai/contracts/interfaces';
import { useRssSources } from '@hooks/data/content/use-rss-sources';
import type { PublishingRssSourcesSectionProps } from '@props/scheduler/rss-sources-section.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
import { type ChangeEvent, useCallback, useState } from 'react';

function getCredentialLabel(credential: ICredential): string {
  const handle = credential.externalHandle?.replace(/^@/, '');
  return (
    credential.label ??
    credential.externalName ??
    (handle ? `@${handle}` : credential.platform)
  );
}

function formatInstant(value: string | null | undefined): string {
  if (!value) {
    return 'Never polled';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function parseImportPolicy(value: string): RssImportPolicy {
  if (value === RssImportPolicy.SCHEDULED) {
    return RssImportPolicy.SCHEDULED;
  }
  if (value === RssImportPolicy.PUBLISH_NOW) {
    return RssImportPolicy.PUBLISH_NOW;
  }
  return RssImportPolicy.DRAFT;
}

function parseApprovalMode(value: string): RssApprovalMode {
  if (value === RssApprovalMode.AUTO) {
    return RssApprovalMode.AUTO;
  }
  return RssApprovalMode.APPROVAL;
}

export default function PublishingRssSourcesSection({
  brandId,
  credentials,
  timezone,
}: PublishingRssSourcesSectionProps) {
  const notifications = NotificationsService.getInstance();
  const { create, isLoading, pollNow, remove, sources, update } = useRssSources(
    { brandId },
  );

  const [feedUrl, setFeedUrl] = useState('');
  const [label, setLabel] = useState('');
  const [importPolicy, setImportPolicy] = useState<RssImportPolicy>(
    RssImportPolicy.DRAFT,
  );
  const [approvalMode, setApprovalMode] = useState<RssApprovalMode>(
    RssApprovalMode.APPROVAL,
  );
  const [selectedCredentialIds, setSelectedCredentialIds] = useState<string[]>(
    [],
  );
  const [isSaving, setIsSaving] = useState(false);

  const toggleChannel = useCallback((credentialId: string) => {
    setSelectedCredentialIds((previous) =>
      previous.includes(credentialId)
        ? previous.filter((id) => id !== credentialId)
        : [...previous, credentialId],
    );
  }, []);

  const handleCreate = useCallback(async () => {
    const nextLabel = label.trim();
    const nextUrl = feedUrl.trim();
    const channels = credentials.filter((credential) =>
      selectedCredentialIds.includes(credential.id),
    );
    if (!nextLabel || !nextUrl || channels.length === 0) {
      return;
    }
    setIsSaving(true);
    try {
      await create({
        approvalMode,
        brandId,
        feedUrl: nextUrl,
        importPolicy,
        label: nextLabel,
        targetChannels: channels.map((credential) => ({
          credentialId: credential.id,
          platform: String(credential.platform).toLowerCase(),
        })),
        timezone,
      });
      setFeedUrl('');
      setLabel('');
      setSelectedCredentialIds([]);
      notifications.success('RSS source saved');
    } catch (error) {
      logger.error('Failed to create RSS source', error);
      notifications.error('Failed to create RSS source');
    } finally {
      setIsSaving(false);
    }
  }, [
    approvalMode,
    brandId,
    create,
    credentials,
    feedUrl,
    importPolicy,
    label,
    notifications,
    selectedCredentialIds,
    timezone,
  ]);

  const handleToggleEnabled = useCallback(
    async (source: IRssSource, isEnabled: boolean) => {
      try {
        await update(source.id, { isEnabled });
      } catch (error) {
        logger.error('Failed to update RSS source', error);
        notifications.error('Failed to update RSS source');
      }
    },
    [notifications, update],
  );

  const handlePollNow = useCallback(
    async (source: IRssSource) => {
      try {
        await pollNow(source.id);
        notifications.success('RSS poll started');
      } catch (error) {
        logger.error('Failed to poll RSS source', error);
        notifications.error('Failed to poll RSS source');
      }
    },
    [notifications, pollNow],
  );

  const handleDelete = useCallback(
    async (source: IRssSource) => {
      try {
        await remove(source.id);
        notifications.success('RSS source deleted');
      } catch (error) {
        logger.error('Failed to delete RSS source', error);
        notifications.error('Failed to delete RSS source');
      }
    },
    [notifications, remove],
  );

  return (
    <Card
      label="RSS sources"
      description="Import feed items as drafts, scheduled posts, or publish-now releases."
      bodyClassName="gap-3 p-4"
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading RSS sources…</p>
      ) : sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No RSS sources yet. Add a feed URL below.
        </p>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <div
              key={source.id}
              className="space-y-3 rounded-card bg-background-secondary/40 p-4 shadow-border"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{source.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {source.feedUrl}
                  </p>
                </div>
                <Switch
                  aria-label={`Enable ${source.label}`}
                  isChecked={source.isEnabled}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    void handleToggleEnabled(source, event.target.checked);
                  }}
                />
              </div>
              <dl className="grid gap-3 sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Last polled</dt>
                  <dd className="mt-1 text-sm">
                    {formatInstant(source.lastPolledAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Imported</dt>
                  <dd className="mt-1 text-sm">{source.importedCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Skipped</dt>
                  <dd className="mt-1 text-sm">{source.skippedCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Failed</dt>
                  <dd className="mt-1 text-sm">{source.failedCount}</dd>
                </div>
              </dl>
              {source.lastError ? (
                <p className="text-sm text-destructive">{source.lastError}</p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  label="Poll now"
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  withWrapper={false}
                  onClick={() => {
                    void handlePollNow(source);
                  }}
                />
                <Button
                  label="Delete"
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  withWrapper={false}
                  onClick={() => {
                    void handleDelete(source);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3 border-t border-border pt-3">
        <p className="text-sm font-medium text-foreground">Add RSS source</p>
        <Input
          aria-label="RSS feed URL"
          placeholder="https://example.com/feed.xml"
          value={feedUrl}
          onChange={(event) => setFeedUrl(event.target.value)}
        />
        <Input
          aria-label="RSS source label"
          placeholder="Source label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            value={importPolicy}
            onValueChange={(value) => setImportPolicy(parseImportPolicy(value))}
          >
            <SelectTrigger aria-label="Import policy">
              <SelectValue placeholder="Import policy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={RssImportPolicy.DRAFT}>Draft</SelectItem>
              <SelectItem value={RssImportPolicy.SCHEDULED}>
                Scheduled
              </SelectItem>
              <SelectItem value={RssImportPolicy.PUBLISH_NOW}>
                Publish now
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={approvalMode}
            onValueChange={(value) => setApprovalMode(parseApprovalMode(value))}
          >
            <SelectTrigger aria-label="Approval mode">
              <SelectValue placeholder="Approval mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={RssApprovalMode.APPROVAL}>Approval</SelectItem>
              <SelectItem value={RssApprovalMode.AUTO}>Auto</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Target channels
          </p>
          {credentials.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Connect an account before saving an RSS source.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {credentials.map((credential) => (
                <label
                  key={credential.id}
                  className="flex items-center gap-2 text-sm"
                  htmlFor={`rss-channel-${credential.id}`}
                >
                  <Checkbox
                    id={`rss-channel-${credential.id}`}
                    isChecked={selectedCredentialIds.includes(credential.id)}
                    onChange={() => toggleChannel(credential.id)}
                  />
                  <span>{getCredentialLabel(credential)}</span>
                  <Badge variant="outline">{credential.platform}</Badge>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            isDisabled={
              isSaving ||
              feedUrl.trim().length === 0 ||
              label.trim().length === 0 ||
              selectedCredentialIds.length === 0
            }
            withWrapper={false}
            onClick={() => {
              void handleCreate();
            }}
          >
            {isSaving ? 'Saving…' : 'Save RSS source'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

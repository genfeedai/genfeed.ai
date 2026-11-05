'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { IAgentMemoryRevision } from '@genfeedai/contracts/interfaces';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AgentMemoriesService } from '@services/automation/agent-memories.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import type {
  EditMemoryDialogProps,
  MemoryRevisionPage,
  OlderRevisionPages,
} from '@/props/settings/org-memory.props';

const REVISION_PAGE_SIZE = 10;

const EMPTY_REVISIONS: IAgentMemoryRevision[] = [];

function memoryRevisionsQueryKey(memoryId: string) {
  return ['organization-memory-revisions', memoryId] as const;
}

function isConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'status' in error.response &&
    error.response.status === 409
  );
}

/**
 * Corrects a shared memory. Saving never overwrites: the API appends a revision
 * and keeps every earlier one, which this dialog lists underneath the form.
 */
export default function EditMemoryDialog({
  entry,
  onCorrected,
  onOpenChange,
}: EditMemoryDialogProps) {
  const translate = useTranslations('common.settings.memory');
  const queryClient = useQueryClient();
  const notificationsService = NotificationsService.getInstance();
  const getMemoriesService = useAuthedService(
    useCallback((token: string) => AgentMemoriesService.getInstance(token), []),
  );

  const [content, setContent] = useState('');
  const [reason, setReason] = useState('');
  // One key per opening, so a retry after a lost response returns the same revision.
  const [requestId, setRequestId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const entryId = entry?.id;
  const entryContent = entry?.content ?? '';

  // The first page of history reads through React Query, so reopening a
  // memory paints its revisions at once and refreshes them in the background.
  const historyQuery = useAuthedQuery<AgentMemoriesService, MemoryRevisionPage>(
    {
      enabled: Boolean(entryId),
      queryFn: (service, signal) =>
        service.listRevisions(
          entryId ?? '',
          { limit: REVISION_PAGE_SIZE },
          signal,
        ),
      queryKey: memoryRevisionsQueryKey(entryId ?? ''),
      service: (token: string) => AgentMemoriesService.getInstance(token),
    },
  );
  // Pages fetched with "Load more" stay with the opening they were read in.
  const [olderPages, setOlderPages] = useState<OlderRevisionPages>({
    entryId,
    items: [],
    nextCursor: null,
  });
  const [isLoadMoreError, setIsLoadMoreError] = useState(false);
  if (olderPages.entryId !== entryId) {
    setOlderPages({ entryId, items: [], nextCursor: null });
    setIsLoadMoreError(false);
  }
  const hasOlderPages = olderPages.items.length > 0;
  const firstPage = historyQuery.data;
  const revisions = firstPage
    ? [...firstPage.items, ...olderPages.items]
    : historyQuery.error
      ? EMPTY_REVISIONS
      : null;
  const nextCursor = hasOlderPages
    ? olderPages.nextCursor
    : (firstPage?.nextCursor ?? null);
  // A failed background refresh keeps the history on screen.
  const isHistoryError =
    isLoadMoreError || (Boolean(historyQuery.error) && !firstPage);

  const { error: historyError } = historyQuery;
  useEffect(() => {
    if (historyError) {
      logger.error('GET /agent/memories/:id/revisions failed', historyError);
    }
  }, [historyError]);

  useEffect(() => {
    if (!entryId) {
      return;
    }
    setContent(entryContent);
    setReason('');
    setRequestId(crypto.randomUUID());
  }, [entryId, entryContent]);

  const loadMore = useCallback(async () => {
    if (!entryId || !nextCursor) {
      return;
    }
    try {
      const service = await getMemoriesService();
      const page = await service.listRevisions(entryId, {
        cursor: nextCursor,
        limit: REVISION_PAGE_SIZE,
      });
      setOlderPages((current) =>
        current.entryId === entryId
          ? {
              entryId,
              items: [...current.items, ...page.items],
              nextCursor: page.nextCursor,
            }
          : current,
      );
    } catch (error) {
      logger.error('GET /agent/memories/:id/revisions failed', error);
      setIsLoadMoreError(true);
    }
  }, [entryId, getMemoriesService, nextCursor]);

  const canSave =
    Boolean(entry?.currentRevisionId) &&
    content.trim().length > 0 &&
    content.trim() !== entryContent.trim() &&
    reason.trim().length > 0 &&
    !isSaving;

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!entry?.currentRevisionId || !canSave) {
        return;
      }
      setIsSaving(true);
      try {
        const service = await getMemoriesService();
        await service.correct(entry.id, {
          content,
          expectedRevisionId: entry.currentRevisionId,
          reason,
          requestId,
        });
        void queryClient.invalidateQueries({
          queryKey: memoryRevisionsQueryKey(entry.id),
        });
        notificationsService.success(translate('notifications.corrected'));
        onOpenChange(false);
        await onCorrected();
      } catch (error) {
        logger.error('POST /agent/memories/:id/revisions failed', error);
        notificationsService.error(
          isConflict(error)
            ? translate('error.conflict')
            : translate('error.correct'),
        );
        if (isConflict(error)) {
          void queryClient.invalidateQueries({
            queryKey: memoryRevisionsQueryKey(entry.id),
          });
          onOpenChange(false);
          await onCorrected();
        }
      } finally {
        setIsSaving(false);
      }
    },
    [
      canSave,
      content,
      entry,
      getMemoriesService,
      notificationsService,
      onCorrected,
      onOpenChange,
      queryClient,
      reason,
      requestId,
      translate,
    ],
  );

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>{translate('edit.title')}</DialogTitle>
          <DialogDescription>{translate('edit.description')}</DialogDescription>
        </DialogHeader>

        <Form onSubmit={(event) => void handleSubmit(event)}>
          <Field label={translate('edit.contentLabel')}>
            <Textarea
              isDisabled={isSaving}
              maxLength={20000}
              onChange={(event) => setContent(event.target.value)}
              rows={6}
              value={content}
            />
          </Field>
          <Field label={translate('edit.reasonLabel')}>
            <Input
              isDisabled={isSaving}
              maxLength={2000}
              onChange={(event) => setReason(event.target.value)}
              placeholder={translate('edit.reasonPlaceholder')}
              value={reason}
            />
          </Field>
          <DialogFooter>
            <Button
              isDisabled={isSaving}
              label={translate('edit.cancel')}
              onClick={() => onOpenChange(false)}
              variant={ButtonVariant.SECONDARY}
            />
            <Button
              isDisabled={!canSave}
              isLoading={isSaving}
              label={translate('edit.save')}
              type="submit"
              variant={ButtonVariant.DEFAULT}
            />
          </DialogFooter>
        </Form>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">
            {translate('edit.historyTitle')}
          </h3>
          {isHistoryError ? (
            <p className="text-sm text-muted-foreground">
              {translate('edit.historyLoadFailed')}
            </p>
          ) : null}
          {revisions !== null && revisions.length === 0 && !isHistoryError ? (
            <p className="text-sm text-muted-foreground">
              {translate('edit.historyEmpty')}
            </p>
          ) : null}
          <ol className="flex flex-col gap-3">
            {(revisions ?? []).map((revision) => (
              <li
                className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0"
                key={revision.id}
              >
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">
                    {translate(`edit.kind.${revision.kind}`)}
                  </Badge>
                  <span>
                    {translate('edit.revisionLine', {
                      revision: revision.revision,
                    })}
                  </span>
                  <span>{formatDate(revision.createdAt)}</span>
                  {revision.isCurrent ? (
                    <Badge variant="success">
                      {translate('edit.currentBadge')}
                    </Badge>
                  ) : null}
                </span>
                {revision.reason ? (
                  <p className="text-xs text-muted-foreground">
                    {revision.reason}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap text-sm">
                  {revision.content}
                </p>
              </li>
            ))}
          </ol>
          {nextCursor ? (
            <Button
              label={translate('edit.loadMore')}
              onClick={() => void loadMore()}
              variant={ButtonVariant.SECONDARY}
            />
          ) : null}
        </section>
      </DialogContent>
    </Dialog>
  );
}

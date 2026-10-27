'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { IAgentMemoryRevision } from '@genfeedai/contracts/interfaces';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { EditMemoryDialogProps } from '@props/settings/org-memory.props';
import { AgentMemoriesService } from '@services/automation/agent-memories.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
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

const REVISION_PAGE_SIZE = 10;

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
  const notificationsService = NotificationsService.getInstance();
  const getMemoriesService = useAuthedService(
    useCallback((token: string) => AgentMemoriesService.getInstance(token), []),
  );

  const [content, setContent] = useState('');
  const [reason, setReason] = useState('');
  // One key per opening, so a retry after a lost response returns the same revision.
  const [requestId, setRequestId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [revisions, setRevisions] = useState<IAgentMemoryRevision[] | null>(
    null,
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isHistoryError, setIsHistoryError] = useState(false);

  const entryId = entry?.id;
  const entryContent = entry?.content ?? '';

  useEffect(() => {
    if (!entryId) {
      return;
    }
    setContent(entryContent);
    setReason('');
    setRequestId(crypto.randomUUID());
    setRevisions(null);
    setNextCursor(null);
    setIsHistoryError(false);

    const controller = new AbortController();
    void (async () => {
      try {
        const service = await getMemoriesService();
        const page = await service.listRevisions(
          entryId,
          { limit: REVISION_PAGE_SIZE },
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        setRevisions(page.items);
        setNextCursor(page.nextCursor);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('GET /agent/memories/:id/revisions failed', error);
        setIsHistoryError(true);
        setRevisions([]);
      }
    })();
    return () => controller.abort();
  }, [entryId, entryContent, getMemoriesService]);

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
      setRevisions((current) => [...(current ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      logger.error('GET /agent/memories/:id/revisions failed', error);
      setIsHistoryError(true);
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

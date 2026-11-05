'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { NotificationsService } from '@services/core/notifications.service';
import { ListRowsSkeleton } from '@ui/lists/list-row/ListRowsSkeleton';
import { formatThreadTime } from '@ui/lists/thread-list/group-by-recency';
import {
  ThreadListRecencySections,
  ThreadListRow,
  ThreadListSubtitle,
} from '@ui/lists/thread-list/ThreadList';
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
import { Pencil, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import type {
  ClipperProjectListProps,
  ClipperProjectSummary,
} from '@/props/studio/clipper.props';
import { youtubeThumbnailUrl } from '../utils/youtube-thumbnail';

export default function ClipperProjectList({
  isLoading,
  projects,
  onRename,
  onDelete,
}: ClipperProjectListProps) {
  const { href } = useOrgUrl();
  const t = useTranslations('pages.studioClipper');
  const locale = useLocale();
  const [renameTarget, setRenameTarget] =
    useState<ClipperProjectSummary | null>(null);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const projectHref = (project: ClipperProjectSummary) =>
    href(`${APP_ROUTES.STUDIO.CLIPPER}/${project.id}`);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTarget || !onRename || !name.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await onRename(renameTarget.id, name.trim());
      setRenameTarget(null);
    } catch {
      NotificationsService.getInstance().error(t('updateFailed'));
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteProject(id: string) {
    try {
      await onDelete?.(id);
    } catch {
      NotificationsService.getInstance().error(t('deleteFailed'));
    }
  }

  function row(project: ClipperProjectSummary) {
    const thumbnail = youtubeThumbnailUrl(project.sourceVideoUrl);
    return (
      <ThreadListRow
        actions={[
          ...(onRename
            ? [
                {
                  id: 'rename',
                  label: t('rename'),
                  icon: <Pencil className="size-4" />,
                  onSelect: () => {
                    setName(project.name);
                    setRenameTarget(project);
                  },
                },
              ]
            : []),
          ...(onDelete
            ? [
                {
                  id: 'delete',
                  label: t('delete'),
                  icon: <Trash2 className="size-4" />,
                  isDestructive: true,
                  onSelect: () => void deleteProject(project.id),
                },
              ]
            : []),
        ]}
        actionsLabel={t('projectActions', { name: project.name })}
        data-testid={`clipper-project-row-${project.id}`}
        href={projectHref(project)}
        leading={
          thumbnail ? (
            <Image
              src={thumbnail}
              alt=""
              width={48}
              height={27}
              unoptimized
              className="mt-0.5 shrink-0 rounded object-cover"
            />
          ) : undefined
        }
        status={
          project.status === 'failed'
            ? 'attention'
            : project.isDraft
              ? 'idle'
              : 'done'
        }
        subtitle={
          <ThreadListSubtitle
            parts={[
              project.isDraft
                ? t('draftBadge')
                : t('clipsCount', { count: project.readyClipCount }),
              project.isDraft ? null : project.status.replaceAll('_', ' '),
            ]}
          />
        }
        time={formatThreadTime(project.updatedAt ?? project.createdAt, locale)}
        title={project.name}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="clipper-project-list">
      {isLoading ? (
        <div data-testid="clipper-project-list-loading">
          <ListRowsSkeleton rows={3} />
        </div>
      ) : (
        <div data-testid="clipper-projects-all-collection">
          <ThreadListRecencySections
            getDate={(project) => project.updatedAt ?? project.createdAt}
            getKey={(project) => project.id}
            items={projects}
            renderRow={row}
          />
        </div>
      )}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isSaving) setRenameTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('renameTitle')}</DialogTitle>
            <DialogDescription>{t('renameDescription')}</DialogDescription>
          </DialogHeader>
          <Form onSubmit={(event) => void saveName(event)}>
            <Field label={t('projectName')}>
              <Input
                aria-label={t('projectName')}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                disabled={isSaving}
              />
            </Field>
            <DialogFooter>
              <Button
                variant={ButtonVariant.GHOST}
                isDisabled={isSaving}
                onClick={() => setRenameTarget(null)}
                withWrapper={false}
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                isDisabled={!name.trim()}
                isLoading={isSaving}
                withWrapper={false}
              >
                {t('save')}
              </Button>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

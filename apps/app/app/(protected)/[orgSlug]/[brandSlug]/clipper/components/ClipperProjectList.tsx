'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type {
  ClipperProjectListProps,
  ClipperProjectSummary,
} from '@props/studio/clipper.props';
import { NotificationsService } from '@services/core/notifications.service';
import CollectionCarouselSection from '@ui/collection/CollectionCarouselSection';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionSection from '@ui/collection/CollectionSection';
import CollectionView from '@ui/collection/CollectionView';
import { ListRow } from '@ui/lists/list-row/ListRow';
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
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useMemo, useState } from 'react';
import { youtubeThumbnailUrl } from '../utils/youtube-thumbnail';

import ClipperProjectCard from './ClipperProjectCard';

function updatedTime(project: ClipperProjectSummary): number {
  return Date.parse(project.updatedAt ?? project.createdAt ?? '') || 0;
}

export default function ClipperProjectList({
  isLoading,
  isRecentVisible = true,
  projects,
  view,
  onRename,
  onDelete,
}: ClipperProjectListProps) {
  const { href } = useOrgUrl();
  const t = useTranslations('pages.studioClipper');
  const [renameTarget, setRenameTarget] =
    useState<ClipperProjectSummary | null>(null);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const recent = useMemo(
    () =>
      [...projects].sort((a, b) => updatedTime(b) - updatedTime(a)).slice(0, 3),
    [projects],
  );
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

  function actions(project: ClipperProjectSummary) {
    return (
      <CollectionItemActions
        overflowLabel={t('projectActions', { name: project.name })}
        primary={
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            <Link href={projectHref(project)}>{t('open')}</Link>
          </Button>
        }
        overflow={[
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
      />
    );
  }

  function row(project: ClipperProjectSummary) {
    const date = project.updatedAt ?? project.createdAt;
    const thumbnail = youtubeThumbnailUrl(project.sourceVideoUrl);
    return (
      <ListRow
        data-testid={`clipper-project-row-${project.id}`}
        leading={
          thumbnail ? (
            <Image
              src={thumbnail}
              alt=""
              width={64}
              height={36}
              unoptimized
              className="shrink-0 rounded object-cover"
            />
          ) : undefined
        }
        density="compact"
        title={project.name}
        meta={
          <>
            <span>
              {project.isDraft
                ? t('draftBadge')
                : t('clipsCount', { count: project.readyClipCount })}
            </span>
            {!project.isDraft && (
              <span>{project.status.replaceAll('_', ' ')}</span>
            )}
            {date && <span>{getRelativeTime(date)}</span>}
          </>
        }
        trailing={actions(project)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8" data-testid="clipper-project-list">
      {!isLoading && isRecentVisible && (
        <CollectionCarouselSection
          data-testid="clipper-projects-recent"
          title={t('recent')}
          itemCount={recent.length}
        >
          {recent.map((project) => (
            <div
              key={project.id}
              className="min-w-64 shrink-0 basis-[calc((100%_-_2rem)/3)]"
            >
              <ClipperProjectCard
                project={project}
                href={projectHref(project)}
                actions={actions(project)}
              />
            </div>
          ))}
        </CollectionCarouselSection>
      )}
      <CollectionSection
        data-testid="clipper-projects-all"
        title={t('allProjects')}
        itemCount={projects.length}
        isLoading={isLoading}
        isCountVisible
      >
        <CollectionView
          data-testid={
            isLoading
              ? 'clipper-project-list-loading'
              : 'clipper-projects-all-collection'
          }
          items={projects}
          view={view}
          isLoading={isLoading}
          skeletonCount={3}
          getItemKey={(project) => project.id}
          renderListItem={row}
          renderGridItem={(project) => (
            <ClipperProjectCard
              project={project}
              href={projectHref(project)}
              actions={actions(project)}
            />
          )}
        />
      </CollectionSection>
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
                variant={ButtonVariant.SECONDARY}
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

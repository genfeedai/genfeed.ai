'use client';

import { ButtonSize, ButtonVariant, ViewType } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useCollectionViewPreference } from '@hooks/utils/use-collection-view-preference/use-collection-view-preference';
import type {
  ClipProjectSummary,
  ClipsProjectListProps,
} from '@props/studio/clips.props';
import { NotificationsService } from '@services/core/notifications.service';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import CollectionToolbar from '@ui/collection/CollectionToolbar';
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
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useMemo, useState } from 'react';

import ClipsProjectCard from './ClipsProjectCard';

function updatedTime(project: ClipProjectSummary): number {
  return Date.parse(project.updatedAt ?? project.createdAt ?? '') || 0;
}

export default function ClipsProjectList({
  isLoading,
  projects,
  onRename,
  onDelete,
}: ClipsProjectListProps) {
  const { href } = useOrgUrl();
  const t = useTranslations('pages.studioClips');
  const { view, setView } = useCollectionViewPreference({
    defaultView: ViewType.LIST,
    surface: 'studio.clips',
  });
  const [renameTarget, setRenameTarget] = useState<ClipProjectSummary | null>(
    null,
  );
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const recent = useMemo(
    () =>
      [...projects].sort((a, b) => updatedTime(b) - updatedTime(a)).slice(0, 5),
    [projects],
  );
  const projectHref = (project: ClipProjectSummary) =>
    href(`${APP_ROUTES.STUDIO.CLIPS}/${project.id}`);

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

  function actions(project: ClipProjectSummary) {
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

  function row(project: ClipProjectSummary) {
    const date = project.updatedAt ?? project.createdAt;
    return (
      <ListRow
        data-testid={`clips-project-row-${project.id}`}
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
    <div className="flex flex-col gap-8" data-testid="clips-project-list">
      {!isLoading && (
        <CollectionSection
          data-testid="clips-projects-recent"
          title={t('recent')}
          itemCount={recent.length}
        >
          <CollectionList>
            {recent.map((project) => (
              <div key={project.id}>{row(project)}</div>
            ))}
          </CollectionList>
        </CollectionSection>
      )}
      <CollectionSection
        data-testid="clips-projects-all"
        title={t('allProjects')}
        itemCount={projects.length}
        isLoading={isLoading}
        isCountVisible
        actions={<CollectionToolbar view={view} onViewChange={setView} />}
      >
        <CollectionView
          data-testid={
            isLoading
              ? 'clips-project-list-loading'
              : 'clips-projects-all-collection'
          }
          items={projects}
          view={view}
          isLoading={isLoading}
          skeletonCount={3}
          getItemKey={(project) => project.id}
          renderListItem={row}
          renderGridItem={(project) => (
            <ClipsProjectCard
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

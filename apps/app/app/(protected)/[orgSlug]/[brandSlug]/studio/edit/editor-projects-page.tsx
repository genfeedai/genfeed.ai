'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardVariant,
  formatEnumLabel,
  ViewType,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IEditorProject } from '@genfeedai/contracts/interfaces';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useCollectionViewPreference } from '@hooks/utils/use-collection-view-preference/use-collection-view-preference';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { EditorProjectsService } from '@services/editor/editor-projects.service';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import CollectionToolbar from '@ui/collection/CollectionToolbar';
import CollectionView from '@ui/collection/CollectionView';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import Container from '@ui/layout/container/Container';
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
import { Film, Pencil, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';

const COLLECTION_SURFACE = 'studio.editor';
const RECENT_PROJECT_LIMIT = 5;

type EditorProjectsTranslate = ReturnType<typeof useTranslations>;

function formatRelativeTime(
  dateStr: string,
  translate: EditorProjectsTranslate,
): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return translate('justNow');
  }
  if (diffMins < 60) {
    return translate('minutesAgo', { count: diffMins });
  }
  if (diffHours < 24) {
    return translate('hoursAgo', { count: diffHours });
  }
  if (diffDays < 7) {
    return translate('daysAgo', { count: diffDays });
  }
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function getUpdatedTime(project: IEditorProject): number {
  const time = new Date(project.updatedAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export default function EditorProjectsPage() {
  const translate = useTranslations('pages.studioEditor');
  const { href } = useOrgUrl();
  const notificationsService = NotificationsService.getInstance();
  const [projects, setProjects] = useState<IEditorProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<IEditorProject | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const { view, setView } = useCollectionViewPreference({
    defaultView: ViewType.LIST,
    surface: COLLECTION_SURFACE,
  });

  const isLoading = projects === null && error === null;
  const hasProjects = projects !== null && projects.length > 0;

  const recentProjects = useMemo(
    () =>
      [...(projects ?? [])]
        .sort((a, b) => getUpdatedTime(b) - getUpdatedTime(a))
        .slice(0, RECENT_PROJECT_LIMIT),
    [projects],
  );

  const getEditorService = useAuthedService((token: string) =>
    EditorProjectsService.getInstance(token),
  );

  const loadProjects = useCallback(async () => {
    try {
      setProjects(null);
      setError(null);
      const service = await getEditorService();
      const allProjects = await service.findAll();
      setProjects(allProjects);
    } catch (error) {
      logger.error('Failed to load editor projects', error);
      setError(translate('loadFailed'));
    }
  }, [getEditorService, translate]);

  useEffect(() => {
    captureAnalyticsEvent(ANALYTICS_EVENTS.STUDIO_EDITOR_OPENED, {
      surface: 'index',
    });
    loadProjects();
  }, [loadProjects]);

  const handleDelete = useCallback(
    async (projectId: string) => {
      try {
        const service = await getEditorService();
        await service.delete(projectId);
        setProjects((prev) => (prev ?? []).filter((p) => p.id !== projectId));
      } catch (error) {
        logger.error('Failed to delete editor project', {
          error,
          projectId,
        });
        notificationsService.error(translate('deleteFailed'));
      }
    },
    [getEditorService, notificationsService, translate],
  );

  const openRename = useCallback((project: IEditorProject) => {
    setRenameValue(project.name);
    setRenameTarget(project);
  }, []);

  const closeRename = useCallback(() => {
    if (!isRenaming) {
      setRenameTarget(null);
    }
  }, [isRenaming]);

  const handleRename = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = renameValue.trim();
      if (!renameTarget || !name || isRenaming) {
        return;
      }
      if (name === renameTarget.name) {
        setRenameTarget(null);
        return;
      }

      const projectId = renameTarget.id;
      setIsRenaming(true);
      try {
        const service = await getEditorService();
        await service.update(projectId, { name });
        setProjects((prev) =>
          (prev ?? []).map((project) =>
            project.id === projectId
              ? { ...project, name, updatedAt: new Date().toISOString() }
              : project,
          ),
        );
        setRenameTarget(null);
      } catch (error) {
        logger.error('Failed to rename editor project', {
          error,
          projectId,
        });
        notificationsService.error(translate('renameFailed'));
      } finally {
        setIsRenaming(false);
      }
    },
    [
      getEditorService,
      isRenaming,
      notificationsService,
      renameTarget,
      renameValue,
      translate,
    ],
  );

  function renderProjectActions(project: IEditorProject) {
    return (
      <CollectionItemActions
        overflow={[
          {
            icon: <Pencil className="size-4" />,
            id: 'rename',
            label: translate('rename'),
            onSelect: () => openRename(project),
          },
          {
            icon: <Trash2 className="size-4" />,
            id: 'delete',
            isDestructive: true,
            label: translate('delete'),
            onSelect: () => void handleDelete(project.id),
          },
        ]}
        overflowLabel={translate('projectActions', { name: project.name })}
        primary={
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            <Link
              aria-label={translate('openProject', { name: project.name })}
              href={href(`${APP_ROUTES.STUDIO.EDIT}/${project.id}`)}
            >
              {translate('open')}
            </Link>
          </Button>
        }
      />
    );
  }

  function renderProjectFacts(project: IEditorProject) {
    return (
      <>
        <span>{formatRelativeTime(project.updatedAt, translate)}</span>
        {project.status ? (
          <>
            <span aria-hidden="true">&middot;</span>
            <span>{formatEnumLabel(project.status)}</span>
          </>
        ) : null}
      </>
    );
  }

  function renderProjectRow(project: IEditorProject) {
    return (
      <ListRow
        data-testid={`editor-project-row-${project.id}`}
        density="compact"
        meta={renderProjectFacts(project)}
        title={project.name}
        trailing={renderProjectActions(project)}
      />
    );
  }

  function renderProjectCard(project: IEditorProject) {
    return (
      <Card
        bodyClassName="gap-0 p-0"
        className="h-full overflow-hidden"
        data-testid={`editor-project-card-${project.id}`}
        variant={CardVariant.DEFAULT}
      >
        <div
          className="relative flex aspect-video items-center justify-center bg-muted"
          data-testid={`editor-project-thumbnail-${project.id}`}
        >
          {project.thumbnailUrl ? (
            <Image
              alt=""
              className="object-cover outline-media"
              fill
              sizes="(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 100vw"
              src={project.thumbnailUrl}
              unoptimized={!canOptimizeImageSource(project.thumbnailUrl)}
            />
          ) : (
            <Film aria-hidden="true" className="size-8 text-foreground/20" />
          )}
        </div>
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{project.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground/50">
              {renderProjectFacts(project)}
            </div>
          </div>
          {renderProjectActions(project)}
        </div>
      </Card>
    );
  }

  const newProjectButton = (
    <Button asChild size={ButtonSize.SM} variant={ButtonVariant.DEFAULT}>
      <Link href={href(APP_ROUTES.STUDIO.EDIT_NEW)}>
        <Plus className="size-4" />
        {translate('newProject')}
      </Link>
    </Button>
  );
  const emptyProjectButton = (
    <Button asChild size={ButtonSize.SM} variant={ButtonVariant.DEFAULT}>
      <Link href={href(APP_ROUTES.STUDIO.EDIT_NEW)}>
        <Plus className="size-4" />
        {translate('startNewProject')}
      </Link>
    </Button>
  );

  const viewToolbar = <CollectionToolbar onViewChange={setView} view={view} />;

  return (
    <Container
      label={
        hasProjects
          ? translate('yourProjectsCount', { count: projects.length })
          : isLoading
            ? translate('yourProjects')
            : translate('editor')
      }
      right={error ? undefined : newProjectButton}
      titleVisibility="sr-only"
      // `right` disappears on error, which would otherwise flip Container
      // between module chrome and the classic layout as the page moves
      // through loading/error/loaded. Declare the chrome mode once so it
      // stays stable across all three.
      moduleChrome
    >
      {isLoading ? (
        <CollectionSection
          actions={viewToolbar}
          isLoading
          title={translate('allProjects')}
        >
          <CollectionView
            data-testid="editor-projects-loading"
            getItemKey={(project: IEditorProject) => project.id}
            isLoading
            items={[]}
            renderGridItem={renderProjectCard}
            renderListItem={renderProjectRow}
            skeletonCount={3}
            view={view}
          />
        </CollectionSection>
      ) : error ? (
        <ErrorFallback
          title={translate('loadFailedTitle')}
          description={error}
          resetErrorBoundary={loadProjects}
        />
      ) : hasProjects ? (
        <div className="flex flex-col gap-8">
          <CollectionSection
            data-testid="editor-projects-recent"
            itemCount={recentProjects.length}
            title={translate('recent')}
          >
            <CollectionList>
              {recentProjects.map((project) => (
                <div key={project.id}>{renderProjectRow(project)}</div>
              ))}
            </CollectionList>
          </CollectionSection>

          <CollectionSection
            actions={viewToolbar}
            data-testid="editor-projects-all"
            isCountVisible
            itemCount={projects.length}
            title={translate('allProjects')}
          >
            <CollectionView
              data-testid="editor-projects-all-collection"
              getItemKey={(project) => project.id}
              items={projects}
              renderGridItem={renderProjectCard}
              renderListItem={renderProjectRow}
              view={view}
            />
          </CollectionSection>
        </div>
      ) : (
        <CardEmpty
          icon={Film}
          label={translate('emptyTitle')}
          description={translate('emptyDescription')}
          actions={emptyProjectButton}
        />
      )}

      <Dialog
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeRename();
          }
        }}
        open={renameTarget !== null}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{translate('renameTitle')}</DialogTitle>
            <DialogDescription>
              {translate('renameDescription')}
            </DialogDescription>
          </DialogHeader>
          <Form onSubmit={(event) => void handleRename(event)}>
            <Field label={translate('projectName')}>
              <Input
                aria-label={translate('projectName')}
                disabled={isRenaming}
                maxLength={120}
                onChange={(event) => setRenameValue(event.target.value)}
                value={renameValue}
              />
            </Field>
            <DialogFooter>
              <Button
                isDisabled={isRenaming}
                onClick={closeRename}
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              >
                {translate('cancel')}
              </Button>
              <Button
                isDisabled={!renameValue.trim()}
                isLoading={isRenaming}
                type="submit"
                withWrapper={false}
              >
                {translate('save')}
              </Button>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
